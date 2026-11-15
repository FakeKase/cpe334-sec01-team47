import { describe, expect, it } from "vitest"

import { hashPassword, hashToken, newToken, verifyPassword } from "../../src/security"

describe("security (TEST-08)", () => {
	it("hashes passwords with bcrypt and verifies them", async () => {
		const hash = await hashPassword("Secr3t!", 4)
		expect(hash).not.toBe("Secr3t!")
		expect(hash.startsWith("$2")).toBe(true)
		expect(await verifyPassword("Secr3t!", hash)).toBe(true)
		expect(await verifyPassword("wrong", hash)).toBe(false)
	})
	it("hashes tokens to deterministic 64-char hex", () => {
		const token = newToken()
		const hash = hashToken(token)
		expect(hash).toMatch(/^[0-9a-f]{64}$/)
		expect(hash).not.toBe(token)
		expect(hashToken(token)).toBe(hash)
	})
	it("generates 256-bit unique tokens", () => {
		const a = newToken()
		expect(Buffer.from(a, "base64url")).toHaveLength(32)
		expect(newToken()).not.toBe(a)
	})
})
