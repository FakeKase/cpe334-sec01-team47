/** BR-09: an approved request can be checked out only from its start date to its due date, both inclusive.
 * Dates are YYYY-MM-DD strings, so plain string comparison orders them. */
export function checkoutWindow(startDate: string, dueDate: string, today: string): "early" | "late" | null {
	if (today < startDate) return "early"
	if (today > dueDate) return "late"
	return null
}
