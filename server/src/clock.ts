export type Clock = () => Date

export const systemClock: Clock = () => new Date()

/** The current date as YYYY-MM-DD in the given IANA timezone. */
export function today(clock: Clock, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(clock())
}

export function addDays(ymd: string, days: number): string {
	const d = new Date(`${ymd}T00:00:00Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}
