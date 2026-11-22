import { describe, expect, it } from "vitest"

import { addDays } from "../../src/clock"

// TEMPORARY (Lab 5, C-02): this test fails on purpose to show that a failed
// required check blocks the merge. Never merge this branch.
describe("temporary C-02 demonstration", () => {
	it("fails on purpose: addDays crosses a month end", () => {
		expect(addDays("2026-11-28", 5)).toBe("2026-12-04") // correct value is 2026-12-03
	})
})
