import { describe, expect, it } from "vitest"

import { isAssetTag, normalizeAssetTag } from "../../src/domain/assetTag"

describe("asset tag format (TEST-52, BR-12)", () => {
	const cases: [input: string, valid: boolean][] = [
		["AB-123", true], // shortest letters and digits
		["ABCDE-12345", true], // longest letters and digits
		[" cpe-0042 ", true], // trimmed and upper-cased first
		["A-123", false], // one letter
		["ABCDEF-123", false], // six letters
		["AB-12", false], // two digits
		["AB-123456", false], // six digits
		["AB0123", false], // no hyphen
		["AB-12a", false], // letter among the digits
		["", false],
	]

	it.each(cases)("%j -> %s", (input, valid) => {
		expect(isAssetTag(normalizeAssetTag(input))).toBe(valid)
	})

	it("normalises to trimmed upper case", () => {
		expect(normalizeAssetTag(" cpe-0042 ")).toBe("CPE-0042")
	})
})
