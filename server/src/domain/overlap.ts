/** BR-03 / BR-04. Inclusive YYYY-MM-DD ranges: sharing a single day counts as an overlap. */
export function periodsOverlap(aStart: string, aDue: string, bStart: string, bDue: string): boolean {
	return aStart <= bDue && bStart <= aDue
}
