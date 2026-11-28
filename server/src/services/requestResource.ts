import type { Prisma } from "@prisma/client"

import { isOverdue } from "../domain/overdue"

/** Prisma `select` for the request resource shared by F-03 to F-07 (F-03 contract §4, `cancelledAt` from F-06 §4, checkout and return fields from F-07 §4). */
export const requestResourceSelect = {
	id: true,
	status: true,
	item: { select: { id: true, assetTag: true, name: true } },
	borrower: { select: { id: true, displayName: true } },
	startDate: true,
	dueDate: true,
	purpose: true,
	rejectionReason: true,
	decidedBy: { select: { id: true, displayName: true } },
	decidedAt: true,
	cancelledAt: true,
	checkedOutBy: { select: { id: true, displayName: true } },
	checkedOutAt: true,
	returnedTo: { select: { id: true, displayName: true } },
	returnedAt: true,
	returnCondition: true,
	returnNote: true,
	createdAt: true,
} satisfies Prisma.BorrowRequestSelect

type Row = Prisma.BorrowRequestGetPayload<{ select: typeof requestResourceSelect }>

/** @db.Date columns come back as UTC midnight. */
export const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** `today` is YYYY-MM-DD in APP_TIMEZONE; `overdue` is derived from it on every read (F-08, DD-06). */
export function toRequestResource(r: Row, today: string) {
	const dueDate = ymd(r.dueDate)
	return { ...r, startDate: ymd(r.startDate), dueDate, overdue: isOverdue(r.status, dueDate, today) }
}

export type RequestResource = ReturnType<typeof toRequestResource>
