import { describe, expect, it } from "vitest"

import { periodsOverlap } from "../../src/domain/overlap"

describe("periodsOverlap (TEST-22, BR-03/BR-04)", () => {
	const cases: [bStart: string, bDue: string, expected: boolean][] = [
		["2026-11-22", "2026-11-24", true], // starts on the due date (inclusive)
		["2026-11-23", "2026-11-25", false], // starts the day after
		["2026-11-18", "2026-11-20", true], // ends on the start date
		["2026-11-21", "2026-11-21", true], // inside
		["2026-11-10", "2026-11-30", true], // covers
	]

	it.each(cases)("20–22 Nov vs %s..%s -> %s", (bStart, bDue, expected) => {
		expect(periodsOverlap("2026-11-20", "2026-11-22", bStart, bDue)).toBe(expected)
		expect(periodsOverlap(bStart, bDue, "2026-11-20", "2026-11-22")).toBe(expected) // symmetric
	})
})
