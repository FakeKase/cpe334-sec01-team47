import { formatDate, formatPeriod, formatTimestamp, formatTimestampDate } from "./requests"

describe("request date formatting", () => {
	it("formats YYYY-MM-DD dates and periods", () => {
		expect(formatDate("2026-11-20")).toBe("20 Nov 2026")
		expect(formatPeriod("2026-11-20", "2026-11-22")).toBe("20 Nov – 22 Nov 2026")
		expect(formatPeriod("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027")
		expect(formatTimestampDate("2026-11-14T18:00:00.000Z")).toBe("15 Nov 2026") // 01:00 in Bangkok
		expect(formatTimestamp("2026-11-12T07:05:00.000Z")).toBe("12 Nov 2026, 14:05")
		expect(formatTimestamp("2026-11-14T17:30:00.000Z")).toBe("15 Nov 2026, 00:30") // midnight is 00, not 24
	})

	it("shows a malformed value as it is instead of NaN or undefined", () => {
		expect(formatDate("20/11/2026")).toBe("20/11/2026")
		expect(formatDate("2026-13-01")).toBe("2026-13-01")
		expect(formatPeriod("bad", "2026-11-22")).toBe("bad – 22 Nov 2026")
		expect(formatTimestampDate("not a date")).toBe("not a date")
		expect(formatTimestamp("not a date")).toBe("not a date")
	})
})
