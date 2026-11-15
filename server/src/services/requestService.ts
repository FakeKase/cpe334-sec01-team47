import type { ItemStatus, Prisma, PrismaClient, RequestStatus, Role } from "@prisma/client"

import { type Clock, today } from "../clock"
import { validateLoanPeriod } from "../domain/loanPeriod"
import { periodsOverlap } from "../domain/overlap"
import { canTransition } from "../domain/transitions"
import { AppError, notFound } from "../errors"
import { isUuid } from "../uuid"
import { requestResourceSelect, toRequestResource, ymd } from "./requestResource"

/** BR-05 limit (SRS Q-04). */
export const MAX_ACTIVE_REQUESTS = 3

const ACTIVE = ["PENDING", "APPROVED", "CHECKED_OUT"] as const
const OCCUPYING: RequestStatus[] = ["APPROVED", "CHECKED_OUT"]

export type NewRequest = { itemId: string; startDate: string; dueDate: string; purpose: string }

type Caller = { id: string; role: Role }

/** Role scope shared by F-04 and F-05: a Borrower sees only their own requests, a Custodian sees all. */
const scope = (user: Caller): Prisma.BorrowRequestWhereInput =>
	user.role === "BORROWER" ? { borrowerId: user.id } : {}

const invalidTransition = (message = "Only pending requests can be approved or rejected.") =>
	new AppError("INVALID_TRANSITION", 409, message)

type Decision = { status: "APPROVED" } | { status: "REJECTED"; rejectionReason: string }

/** Guarded write: 0 rows updated means another decision got there first (F-05 §1 step 2.4). */
async function decide(db: Prisma.TransactionClient, id: string, decidedById: string, decidedAt: Date, d: Decision) {
	const { count } = await db.borrowRequest.updateMany({
		where: { id, status: "PENDING" },
		data: { ...d, decidedById, decidedAt },
	})
	if (count === 0) throw invalidTransition()
	return toRequestResource(await db.borrowRequest.findUniqueOrThrow({ where: { id }, select: requestResourceSelect }))
}

export function requestService({ prisma, clock, timeZone }: { prisma: PrismaClient; clock: Clock; timeZone: string }) {
	/** Custodian lookup for approve/reject: no scope, 404 for a malformed or unknown id. */
	async function find(id: string) {
		const row = isUuid(id)
			? await prisma.borrowRequest.findUnique({ where: { id }, select: { itemId: true, status: true } })
			: null
		if (!row) throw notFound()
		return row
	}

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

		/** FR-07. Newest first, except the Custodian's pending queue, which is oldest first (F-05 §4).
		 * Same createdAt → id ascending, so the order is stable. ponytail: no limit, pagination is a later sprint. */
		async list(user: Caller, status?: RequestStatus) {
			const oldestFirst = user.role === "CUSTODIAN" && status === "PENDING"
			const rows = await prisma.borrowRequest.findMany({
				where: { ...scope(user), status },
				orderBy: [{ createdAt: oldestFirst ? "asc" : "desc" }, { id: "asc" }],
				select: requestResourceSelect,
			})
			return rows.map(toRequestResource)
		},

		/** FR-08. The item row lock serialises approvals of one item, so two overlapping approvals cannot both pass
		 * BR-03 (NFR-05). Checks run in contract order: status, period ended, BR-02, BR-03. */
		async approve(custodianId: string, id: string) {
			const { itemId } = await find(id)
			return prisma.$transaction(async (tx) => {
				const [item] = await tx.$queryRaw<{ status: ItemStatus }[]>`
					SELECT status FROM "Item" WHERE id = ${itemId}::uuid FOR UPDATE`
				const r = await tx.borrowRequest.findUniqueOrThrow({
					where: { id },
					select: { status: true, startDate: true, dueDate: true },
				})
				if (!canTransition(r.status, "APPROVED")) throw invalidTransition()
				const [start, due] = [ymd(r.startDate), ymd(r.dueDate)]
				if (due < today(clock, timeZone)) throw invalidTransition("This request's period has already ended.")
				if (item!.status !== "ACTIVE")
					throw new AppError(
						"ITEM_NOT_AVAILABLE",
						409,
						"This item is not available, so the request cannot be approved."
					)

				const booked = await tx.borrowRequest.findMany({
					where: { itemId, id: { not: id }, status: { in: OCCUPYING } },
					select: { startDate: true, dueDate: true },
				})
				if (booked.some((b) => periodsOverlap(start, due, ymd(b.startDate), ymd(b.dueDate))))
					throw new AppError("PERIOD_UNAVAILABLE", 409, "This item is already booked for part of that period.")

				return decide(tx, id, custodianId, clock(), { status: "APPROVED" })
			})
		},

		/** FR-09. `reason` is already trimmed and 1-500 characters (BR-07). */
		async reject(custodianId: string, id: string, reason: string) {
			const { status } = await find(id)
			if (!canTransition(status, "REJECTED")) throw invalidTransition()
			return decide(prisma, id, custodianId, clock(), { status: "REJECTED", rejectionReason: reason })
		},

		/** Another Borrower's request is 404, not 403, so its existence is not revealed (DD-08). */
		async get(user: Caller, id: string) {
			const row = isUuid(id)
				? await prisma.borrowRequest.findFirst({ where: { id, ...scope(user) }, select: requestResourceSelect })
				: null
			if (!row) throw notFound()
			return toRequestResource(row)
		},
	}
}

export type RequestService = ReturnType<typeof requestService>
