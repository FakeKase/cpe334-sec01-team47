import type { ErrorDetail } from "../errors"

/** BR-01 maximum loan length, inclusive of both ends (SRS Q-04). */
export const MAX_LOAN_DAYS = 14

const DAY_MS = 86_400_000
const toUtc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`)

/** BR-01. All arguments are YYYY-MM-DD; `today` is in APP_TIMEZONE. Returns the first failing rule, or []. */
export function validateLoanPeriod(start: string, due: string, today: string): ErrorDetail[] {
	if (start < today) return [{ field: "startDate", message: "Start date cannot be in the past." }]
	if (due < start) return [{ field: "dueDate", message: "Due date must be on or after the start date." }]
	if ((toUtc(due) - toUtc(start)) / DAY_MS + 1 > MAX_LOAN_DAYS)
		return [{ field: "dueDate", message: `A loan can be at most ${MAX_LOAN_DAYS} days.` }]
	return []
}
