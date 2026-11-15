import { describe, expect, it } from "vitest"

import { addDays, today } from "../../src/clock"

describe("clock", () => {
	it("today() uses the app timezone, not UTC", () => {
		const lateUtc = () => new Date("2026-11-14T18:00:00Z") // 01:00 on 15 Nov in Bangkok
		expect(today(lateUtc, "Asia/Bangkok")).toBe("2026-11-15")
		expect(today(lateUtc, "UTC")).toBe("2026-11-14")
	})
	it("addDays crosses month and year ends", () => {
		expect(addDays("2026-11-28", 5)).toBe("2026-12-03")
		expect(addDays("2026-12-30", 3)).toBe("2027-01-02")
	})
})
