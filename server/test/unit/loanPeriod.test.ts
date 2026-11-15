import { describe, expect, it } from "vitest"

import { validateLoanPeriod } from "../../src/domain/loanPeriod"

const TODAY = "2026-11-15"

describe("validateLoanPeriod (TEST-18, BR-01)", () => {
	it("rejects a start date before today", () => {
		expect(validateLoanPeriod("2026-11-14", "2026-11-15", TODAY)).toEqual([
			{ field: "startDate", message: "Start date cannot be in the past." },
		])
	})

	it("accepts a one-day loan starting today", () => {
		expect(validateLoanPeriod("2026-11-15", "2026-11-15", TODAY)).toEqual([])
	})

	it("rejects a due date before the start date", () => {
		expect(validateLoanPeriod("2026-11-15", "2026-11-14", TODAY)).toEqual([
			{ field: "dueDate", message: "Due date must be on or after the start date." },
		])
	})

	it("accepts a 14-day period", () => {
		expect(validateLoanPeriod("2026-11-15", "2026-11-28", TODAY)).toEqual([])
	})

	it("rejects a 15-day period", () => {
		expect(validateLoanPeriod("2026-11-15", "2026-11-29", TODAY)).toEqual([
			{ field: "dueDate", message: "A loan can be at most 14 days." },
		])
	})

	it("counts days across a month end", () => {
		expect(validateLoanPeriod("2026-11-20", "2026-12-03", TODAY)).toEqual([])
		expect(validateLoanPeriod("2026-11-20", "2026-12-04", TODAY)[0]?.field).toBe("dueDate")
	})
})
