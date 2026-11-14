import type { RequestStatus } from "@prisma/client"

/** BR-06. Sprint 1 only exposes PENDING -> APPROVED / REJECTED (F-05 §1). */
const ALLOWED: Record<RequestStatus, readonly RequestStatus[]> = {
	PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
	APPROVED: ["CHECKED_OUT", "CANCELLED"],
	CHECKED_OUT: ["RETURNED"],
	REJECTED: [],
	CANCELLED: [],
	RETURNED: [],
}

export const canTransition = (from: RequestStatus, to: RequestStatus) => ALLOWED[from].includes(to)
