import type { ItemStatus, PrismaClient } from "@prisma/client"

import { type Clock, today } from "../clock"
import { validateLoanPeriod } from "../domain/loanPeriod"
import { periodsOverlap } from "../domain/overlap"
import { AppError, notFound } from "../errors"
import { requestResourceSelect, toRequestResource, ymd } from "./requestResource"

/** BR-05 limit (SRS Q-04). */
export const MAX_ACTIVE_REQUESTS = 3

const ACTIVE = ["PENDING", "APPROVED", "CHECKED_OUT"] as const
const OCCUPYING: readonly string[] = ["APPROVED", "CHECKED_OUT"]

export type NewRequest = { itemId: string; startDate: string; dueDate: string; purpose: string }

export function requestService({ prisma, clock, timeZone }: { prisma: PrismaClient; clock: Clock; timeZone: string }) {
	return {
		/** FR-06. `input` is already schema-valid and `purpose` trimmed; the owner is always `borrowerId`. */
		async create(borrowerId: string, input: NewRequest) {
			const { itemId, startDate, dueDate, purpose } = input
			const periodErrors = validateLoanPeriod(startDate, dueDate, today(clock, timeZone))
			if (periodErrors.length) throw new AppError("VALIDATION_ERROR", 400, "The request is invalid.", periodErrors)

			const row = await prisma.$transaction(async (tx) => {
				// Item first, then the borrower: serialises bookings of this item and BR-05 for this borrower.
				const [item] = await tx.$queryRaw<{ status: ItemStatus }[]>`
					SELECT status FROM "Item" WHERE id = ${itemId}::uuid FOR UPDATE`
				await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${borrowerId}::uuid FOR UPDATE`

				if (!item || item.status === "RETIRED") throw notFound()
				if (item.status === "MAINTENANCE")
					throw new AppError("ITEM_NOT_AVAILABLE", 409, "This item is under maintenance and cannot be requested.")

				const overlapping = (
					await tx.borrowRequest.findMany({
						where: { itemId, status: { in: [...ACTIVE] } },
						select: { borrowerId: true, status: true, startDate: true, dueDate: true },
					})
				).filter((r) => periodsOverlap(startDate, dueDate, ymd(r.startDate), ymd(r.dueDate)))

				if (overlapping.some((r) => OCCUPYING.includes(r.status)))
					throw new AppError("PERIOD_UNAVAILABLE", 409, "This item is already booked for part of that period.")
				if (overlapping.some((r) => r.borrowerId === borrowerId))
					throw new AppError("DUPLICATE_REQUEST", 409, "You already have a request for this item in that period.")

				const active = await tx.borrowRequest.count({ where: { borrowerId, status: { in: [...ACTIVE] } } })
				if (active >= MAX_ACTIVE_REQUESTS)
					throw new AppError(
						"ACTIVE_LIMIT_REACHED",
						409,
						`You can have at most ${MAX_ACTIVE_REQUESTS} active requests.`
					)

				return tx.borrowRequest.create({
					data: {
						itemId,
						borrowerId,
						startDate: new Date(startDate),
						dueDate: new Date(dueDate),
						purpose,
						status: "PENDING",
					},
					select: requestResourceSelect,
				})
			})
			return toRequestResource(row)
		},
	}
}

export type RequestService = ReturnType<typeof requestService>
