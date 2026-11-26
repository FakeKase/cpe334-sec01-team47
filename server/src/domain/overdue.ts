import type { RequestStatus } from "@prisma/client"

/** FR-14 / DD-06: derived on read, never stored. Dates are YYYY-MM-DD, so string comparison orders them. */
export const isOverdue = (status: RequestStatus, dueDate: string, today: string) =>
	status === "CHECKED_OUT" && dueDate < today

/** BR-03: a checked-out loan holds the item until it is returned, so its period runs at least to today. */
export const effectiveEnd = (status: RequestStatus, dueDate: string, today: string) =>
	status === "CHECKED_OUT" && dueDate < today ? today : dueDate
