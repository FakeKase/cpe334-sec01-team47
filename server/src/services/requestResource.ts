import type { Prisma } from "@prisma/client"

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

export const toRequestResource = (r: Row) => ({
	...r,
	startDate: ymd(r.startDate),
	dueDate: ymd(r.dueDate),
})

export type RequestResource = ReturnType<typeof toRequestResource>
