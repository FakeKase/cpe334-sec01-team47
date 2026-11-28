import { describe, expect, it } from "vitest"

import { effectiveEnd, isOverdue } from "../../src/domain/overdue"

describe("overdue derivation (TEST-80, AC-66, FR-14, BR-03)", () => {
	const today = "2026-11-15"
	it.each([
		["CHECKED_OUT due yesterday", "CHECKED_OUT", "2026-11-14", true, "2026-11-15"],
		["CHECKED_OUT due today", "CHECKED_OUT", "2026-11-15", false, "2026-11-15"],
		["CHECKED_OUT due later", "CHECKED_OUT", "2026-11-20", false, "2026-11-20"],
		["APPROVED never checked out", "APPROVED", "2026-11-10", false, "2026-11-10"],
		["RETURNED late", "RETURNED", "2026-11-10", false, "2026-11-10"],
	] as const)("%s", (_name, status, due, overdue, end) => {
		expect(isOverdue(status, due, today)).toBe(overdue)
		expect(effectiveEnd(status, due, today)).toBe(end)
	})
})
