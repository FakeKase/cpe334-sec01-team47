import type { RequestStatus } from "@prisma/client"

/** BR-06, the full table. Approve and reject are F-05, cancel is F-06, checkout and return are F-07. */
const ALLOWED: Record<RequestStatus, readonly RequestStatus[]> = {
	PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
	APPROVED: ["CHECKED_OUT", "CANCELLED"],
	CHECKED_OUT: ["RETURNED"],
	REJECTED: [],
	CANCELLED: [],
	RETURNED: [],
}

export const canTransition = (from: RequestStatus, to: RequestStatus) => ALLOWED[from].includes(to)
