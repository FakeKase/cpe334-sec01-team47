import { describe, expect, it } from "vitest"

import { checkoutWindow } from "../../src/domain/checkoutWindow"

describe("checkoutWindow (TEST-66, AC-56, BR-09)", () => {
	const today = "2026-11-15"
	it.each([
		["start today", "2026-11-15", "2026-11-20", null],
		["due today", "2026-11-10", "2026-11-15", null],
		["inside the period", "2026-11-12", "2026-11-18", null],
		["starts tomorrow", "2026-11-16", "2026-11-20", "early"],
		["due yesterday", "2026-11-10", "2026-11-14", "late"],
	] as const)("%s -> %s", (_name, start, due, expected) => {
		expect(checkoutWindow(start, due, today)).toBe(expected)
	})
})
