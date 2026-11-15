import { Elysia } from "elysia"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { unauthenticated } from "../../src/errors"
import { requireAuth, requireRole } from "../../src/middleware/auth"
import { errorHandler } from "../../src/middleware/errorHandler"
import type { AuthService } from "../../src/services/authService"

// Stub service: "Bearer borrower" / "Bearer custodian" authenticate, anything else is 401.
const users = {
	"Bearer borrower": { id: "u1", email: "b@example.test", displayName: "B", role: "BORROWER" as const },
	"Bearer custodian": { id: "u2", email: "c@example.test", displayName: "C", role: "CUSTODIAN" as const },
}
const auth = {
	async authenticate(header: string | null | undefined) {
		const user = users[header as keyof typeof users]
		if (!user) throw unauthenticated()
		return { sessionId: "s1", user }
	},
} as unknown as AuthService

const app = new Elysia()
	.use(errorHandler)
	.use(requireAuth(auth))
	.post("/things", ({ user }) => ({ ok: true, role: user.role }), {
		body: z.object({ name: z.string().min(1) }),
	})
	.post("/admin", () => ({ ok: true }), {
		transform: requireRole("CUSTODIAN"),
		body: z.object({ name: z.string().min(1) }),
	})

const post = (path: string, body: unknown, token?: string) =>
	app.handle(
		new Request(`http://localhost${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
			body: JSON.stringify(body),
		})
	)

describe("requireAuth (AC-06)", () => {
	it("answers 401, not 400, when an anonymous request has no body", async () => {
		const res = await app.handle(new Request("http://localhost/things", { method: "POST" }))
		expect(res.status).toBe(401)
		expect(await res.json()).toEqual({
			error: { code: "UNAUTHENTICATED", message: "Authentication required." },
		})
	})

	it("answers 401 without leaking field names when an anonymous body is invalid", async () => {
		const res = await post("/things", { wrong: 1 })
		expect(res.status).toBe(401)
		const text = JSON.stringify(await res.json())
		expect(text).not.toContain("details")
		expect(text).not.toContain("name")
	})

	it("still validates the body once the caller is authenticated", async () => {
		const res = await post("/things", { wrong: 1 }, "borrower")
		expect(res.status).toBe(400)
		expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
	})

	it("runs the handler for an authenticated caller with a valid body", async () => {
		const res = await post("/things", { name: "x" }, "borrower")
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ ok: true, role: "BORROWER" })
	})
})

describe("requireRole", () => {
	it("403 FORBIDDEN when the role is not allowed", async () => {
		const res = await post("/admin", { name: "x" }, "borrower")
		expect(res.status).toBe(403)
		expect(await res.json()).toEqual({
			error: { code: "FORBIDDEN", message: "You are not allowed to do this." },
		})
	})

	it("403, not 400, when the role is not allowed and the body is invalid", async () => {
		const res = await post("/admin", { wrong: 1 }, "borrower")
		expect(res.status).toBe(403)
	})

	it("lets an allowed role through", async () => {
		const res = await post("/admin", { name: "x" }, "custodian")
		expect(res.status).toBe(200)
	})

	it("401 before 403 for an anonymous caller", async () => {
		const res = await post("/admin", { name: "x" })
		expect(res.status).toBe(401)
	})
})
