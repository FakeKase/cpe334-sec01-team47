/** Request resource shared by F-03, F-04 and F-05 (docs/sprints/sprint-1/F-03-submit-request.md §4). */
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "CHECKED_OUT" | "RETURNED"

export type BorrowRequest = {
	id: string
	status: RequestStatus
	item: { id: string; assetTag: string; name: string }
	borrower: { id: string; displayName: string }
	startDate: string
	dueDate: string
	purpose: string
	rejectionReason: string | null
	decidedBy: { id: string; displayName: string } | null
	decidedAt: string | null
	createdAt: string
}

const neutral = "bg-badge-neutral-bg text-badge-neutral-fg"

// Figma "Status badge" (SDS §C3 colours). ponytail: CHECKED_OUT (purple) and RETURNED (green) use neutral until Sprint 2 adds their tokens.
export const requestStatus: Record<RequestStatus, { label: string; tone: string }> = {
	PENDING: { label: "Pending", tone: neutral },
	APPROVED: { label: "Approved", tone: "bg-badge-info-bg text-info-fg" },
	REJECTED: { label: "Rejected", tone: "bg-badge-error-bg text-error-fg" },
	CANCELLED: { label: "Cancelled", tone: neutral },
	CHECKED_OUT: { label: "Checked out", tone: neutral },
	RETURNED: { label: "Returned", tone: neutral },
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const dayMonth = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`

/** "2026-11-20" → "20 Nov 2026". A malformed value is shown as it is. */
export const formatDate = (ymd: string) => (YMD.test(ymd) ? `${dayMonth(ymd)} ${ymd.slice(0, 4)}` : ymd)

/** "20 Nov – 22 Nov 2026", or "30 Dec 2026 – 2 Jan 2027" across a year. */
export const formatPeriod = (start: string, due: string) =>
	YMD.test(start) && YMD.test(due) && start.slice(0, 4) === due.slice(0, 4)
		? `${dayMonth(start)} – ${formatDate(due)}`
		: `${formatDate(start)} – ${formatDate(due)}`

/** Must match the server's APP_TIMEZONE, which decides "today" for BR-01. */
const timeZone = import.meta.env.VITE_APP_TIMEZONE || "Asia/Bangkok"

/** Today as YYYY-MM-DD in `timeZone`, the "today" that BR-01 compares against. */
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone })

/** The calendar day of a timestamp in `timeZone`. */
export const formatTimestampDate = (iso: string) => {
	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? iso : formatDate(date.toLocaleDateString("en-CA", { timeZone }))
}

/** "12 Nov 2026, 14:05" in `timeZone`. */
export const formatTimestamp = (iso: string) => {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return iso
	const time = date.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
	return `${formatTimestampDate(iso)}, ${time}`
}
