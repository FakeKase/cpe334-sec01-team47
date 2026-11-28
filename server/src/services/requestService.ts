import type { ItemStatus, Prisma, PrismaClient, RequestStatus, ReturnCondition, Role } from "@prisma/client"

import { type Clock, today } from "../clock"
import { checkoutWindow } from "../domain/checkoutWindow"
import { validateLoanPeriod } from "../domain/loanPeriod"
import { effectiveEnd } from "../domain/overdue"
import { periodsOverlap } from "../domain/overlap"
import { canTransition } from "../domain/transitions"
import { AppError, notFound } from "../errors"
import { isUuid } from "../uuid"
import { requestResourceSelect, toRequestResource, ymd } from "./requestResource"

/** BR-05 limit (SRS Q-04). */
export const MAX_ACTIVE_REQUESTS = 3

const ACTIVE = ["PENDING", "APPROVED", "CHECKED_OUT"] as const
const OCCUPYING: RequestStatus[] = ["APPROVED", "CHECKED_OUT"]
const CANCELLABLE: RequestStatus[] = ["PENDING", "APPROVED"] // BR-06: the two transitions into CANCELLED

export type NewRequest = { itemId: string; startDate: string; dueDate: string; purpose: string }

type Caller = { id: string; role: Role }

/** Role scope shared by F-04 and F-05: a Borrower sees only their own requests, a Custodian sees all. */
const scope = (user: Caller): Prisma.BorrowRequestWhereInput =>
	user.role === "BORROWER" ? { borrowerId: user.id } : {}

const invalidTransition = (message = "Only pending requests can be approved or rejected.") =>
	new AppError("INVALID_TRANSITION", 409, message)

/** FR-14: a CHECKED_OUT request whose due date is before `today` (F-08). */
const overdueWhere = (today: string) => ({ status: "CHECKED_OUT" as const, dueDate: { lt: new Date(today) } })

type Decision = { status: "APPROVED" } | { status: "REJECTED"; rejectionReason: string }

/** Guarded write: 0 rows updated means another decision got there first (F-05 §1 step 2.4). */
async function decide(db: Prisma.TransactionClient, id: string, decidedById: string, decidedAt: Date, d: Decision) {
	const { count } = await db.borrowRequest.updateMany({
		where: { id, status: "PENDING" },
		data: { ...d, decidedById, decidedAt },
	})
	if (count === 0) throw invalidTransition()
}

export function requestService({ prisma, clock, timeZone }: { prisma: PrismaClient; clock: Clock; timeZone: string }) {
	const now = () => today(clock, timeZone)
	const reload = async (db: Prisma.TransactionClient, id: string) =>
		toRequestResource(await db.borrowRequest.findUniqueOrThrow({ where: { id }, select: requestResourceSelect }), now())

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
			const t = now()
			const periodErrors = validateLoanPeriod(startDate, dueDate, t)
			if (periodErrors.length) throw new AppError("VALIDATION_ERROR", 400, "The request is invalid.", periodErrors)
			// BR-08 depends only on the Borrower, so it comes before any item check (F-08 §1).
			if (await prisma.borrowRequest.count({ where: { borrowerId, ...overdueWhere(t) } }))
				throw new AppError("OVERDUE_BLOCK", 409, "You have an overdue loan. Return it before making a new request.")

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
				).filter((r) => periodsOverlap(startDate, dueDate, ymd(r.startDate), effectiveEnd(r.status, ymd(r.dueDate), t)))

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
			return toRequestResource(row, t)
		},

		/** FR-07. Newest first, except the Custodian's pending queue, which is oldest first (F-05 §4).
		 * Same createdAt → id ascending, so the order is stable. `overdue` keeps overdue loans only, oldest due date
		 * first (F-08 §2). ponytail: no limit, pagination is a later sprint. */
		async list(user: Caller, status?: RequestStatus, overdue = false) {
			const t = now()
			const oldestFirst = user.role === "CUSTODIAN" && status === "PENDING"
			const rows = await prisma.borrowRequest.findMany({
				where: { ...scope(user), AND: [{ status }, overdue ? overdueWhere(t) : {}] },
				orderBy: overdue
					? [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }]
					: [{ createdAt: oldestFirst ? "asc" : "desc" }, { id: "asc" }],
				select: requestResourceSelect,
			})
			return rows.map((r) => toRequestResource(r, t))
		},

		/** FR-08. The item row lock serialises approvals of one item, so two overlapping approvals cannot both pass
		 * BR-03 (NFR-05). Checks run in contract order: status, period ended, BR-02, BR-03. An overdue loan occupies the
		 * item up to today (F-08). */
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
				const t = now()
				if (due < t) throw invalidTransition("This request's period has already ended.")
				if (item!.status !== "ACTIVE")
					throw new AppError(
						"ITEM_NOT_AVAILABLE",
						409,
						"This item is not available, so the request cannot be approved."
					)

				const booked = await tx.borrowRequest.findMany({
					where: { itemId, id: { not: id }, status: { in: OCCUPYING } },
					select: { status: true, startDate: true, dueDate: true },
				})
				const end = (b: (typeof booked)[number]) => effectiveEnd(b.status, ymd(b.dueDate), t)
				if (booked.some((b) => periodsOverlap(start, due, ymd(b.startDate), end(b))))
					throw new AppError("PERIOD_UNAVAILABLE", 409, "This item is already booked for part of that period.")

				await decide(tx, id, custodianId, clock(), { status: "APPROVED" })
				return reload(tx, id)
			})
		},

		/** FR-09. `reason` is already trimmed and 1-500 characters (BR-07). */
		async reject(custodianId: string, id: string, reason: string) {
			const { status } = await find(id)
			if (!canTransition(status, "REJECTED")) throw invalidTransition()
			await decide(prisma, id, custodianId, clock(), { status: "REJECTED", rejectionReason: reason })
			return reload(prisma, id)
		},

		/** FR-11. Own request only (404 otherwise, DD-08). The guarded write means a concurrent cancel or approve that got
		 * there first leaves 0 rows to update, which is 409 (F-06 §1). Allowed on any date (BR-09). */
		async cancel(borrowerId: string, id: string) {
			const exists = isUuid(id) && (await prisma.borrowRequest.count({ where: { id, borrowerId } })) > 0
			if (!exists) throw notFound()
			const { count } = await prisma.borrowRequest.updateMany({
				where: { id, borrowerId, status: { in: CANCELLABLE } },
				data: { status: "CANCELLED", cancelledAt: clock() },
			})
			if (count === 0) throw invalidTransition("Only pending or approved requests can be cancelled.")
			return reload(prisma, id)
		},

		/** FR-12. Same lock as approve, so a checkout cannot interleave with an approval of the same item. Checks run in
		 * contract order (F-07 §2): status, BR-09 window, item status. The guarded write then settles a race with a
		 * Borrower's cancel: whoever updates the row first wins, the other gets 409. */
		async checkout(custodianId: string, id: string) {
			const { itemId } = await find(id)
			return prisma.$transaction(async (tx) => {
				const [item] = await tx.$queryRaw<{ status: ItemStatus }[]>`
					SELECT status FROM "Item" WHERE id = ${itemId}::uuid FOR UPDATE`
				const r = await tx.borrowRequest.findUniqueOrThrow({
					where: { id },
					select: { status: true, startDate: true, dueDate: true },
				})
				const notApproved = "Only approved requests can be checked out."
				if (!canTransition(r.status, "CHECKED_OUT")) throw invalidTransition(notApproved)
				const [start, due] = [ymd(r.startDate), ymd(r.dueDate)]
				const window = checkoutWindow(start, due, now())
				if (window === "early")
					throw invalidTransition(`This request starts on ${start} and cannot be checked out before then.`)
				if (window === "late")
					throw invalidTransition("The due date has passed, so this request can only be cancelled.")
				if (item!.status !== "ACTIVE")
					throw new AppError("ITEM_NOT_AVAILABLE", 409, "This item is under maintenance, so it cannot be handed over.")
				// Only an overdue loan can still hold the item here: BR-03 kept the approved periods apart (F-07 v0.2).
				if (await tx.borrowRequest.count({ where: { itemId, id: { not: id }, status: "CHECKED_OUT" } }))
					throw new AppError("PERIOD_UNAVAILABLE", 409, "This item is still checked out on another loan.")

				const { count } = await tx.borrowRequest.updateMany({
					where: { id, status: "APPROVED" },
					data: { status: "CHECKED_OUT", checkedOutById: custodianId, checkedOutAt: clock() },
				})
				if (count === 0) throw invalidTransition(notApproved)
				return reload(tx, id)
			})
		},

		/** FR-13 and BR-10. `note` is already trimmed and at most 500 characters. A DAMAGED return sets the item to
		 * MAINTENANCE in the same transaction. The item row lock orders it against approvals and checkouts. */
		async returnItem(custodianId: string, id: string, condition: ReturnCondition, note?: string) {
			const { itemId } = await find(id)
			return prisma.$transaction(async (tx) => {
				await tx.$queryRaw`SELECT id FROM "Item" WHERE id = ${itemId}::uuid FOR UPDATE`
				const { count } = await tx.borrowRequest.updateMany({
					where: { id, status: "CHECKED_OUT" },
					data: {
						status: "RETURNED",
						returnedToId: custodianId,
						returnedAt: clock(),
						returnCondition: condition,
						returnNote: note || null,
					},
				})
				if (count === 0) throw invalidTransition("Only checked-out requests can be returned.")
				if (condition === "DAMAGED")
					await tx.item.updateMany({ where: { id: itemId, status: "ACTIVE" }, data: { status: "MAINTENANCE" } })
				return reload(tx, id)
			})
		},

		/** Another Borrower's request is 404, not 403, so its existence is not revealed (DD-08). */
		async get(user: Caller, id: string) {
			const row = isUuid(id)
				? await prisma.borrowRequest.findFirst({ where: { id, ...scope(user) }, select: requestResourceSelect })
				: null
			if (!row) throw notFound()
			return toRequestResource(row, now())
		},
	}
}

export type RequestService = ReturnType<typeof requestService>
