import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { hashToken } from "../../src/security"
import { credentials, loginAs, startTestApp } from "../helpers/app"
import { prisma, resetDb, TEST_NOW } from "../helpers/db"

const app = startTestApp()
const api = () => request(app.url)

beforeAll(resetDb)
beforeEach(resetDb)
afterAll(async () => {
	await app.stop()
	await prisma.$disconnect()
})

describe("POST /api/auth/login", () => {
	it.each(["BORROWER", "CUSTODIAN"] as const)("TEST-01: logs in the %s", async (role) => {
		const res = await api().post("/api/auth/login").send(credentials[role])
		expect(res.status).toBe(200)
		expect(res.body.token).toEqual(expect.any(String))
		expect(res.body.token.length).toBeGreaterThan(0)
		expect(new Date(res.body.expiresAt).getTime()).toBe(TEST_NOW.getTime() + 8 * 3_600_000)
		expect(res.body.user).toMatchObject({ email: credentials[role].email, role })
		expect(res.body.user.passwordHash).toBeUndefined()
		expect(await prisma.session.count({ where: { user: { role } } })).toBe(1)
	})

	it("TEST-01: accepts the email in a different letter case", async () => {
		const res = await api()
			.post("/api/auth/login")
			.send({ ...credentials.BORROWER, email: "Borrower1@Example.test" })
		expect(res.status).toBe(200)
	})

	it("TEST-02: wrong password and unknown email give identical 401s", async () => {
		const wrong = await api()
			.post("/api/auth/login")
			.send({ ...credentials.BORROWER, password: "nope" })
		const unknown = await api().post("/api/auth/login").send({ email: "nobody@example.test", password: "nope" })
		expect(wrong.status).toBe(401)
		expect(unknown.status).toBe(401)
		expect(wrong.body).toEqual(unknown.body)
		expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS")
		expect(wrong.body.error.message).toBe("Invalid email or password.")
		expect(wrong.body.token).toBeUndefined()
		expect(await prisma.session.count()).toBe(0)
	})

	it.each([
		["password", { email: "borrower1@example.test" }],
		["email", { email: "not-an-email", password: "x" }],
		["password", { email: "borrower1@example.test", password: "" }],
		["password", { email: "borrower1@example.test", password: "a".repeat(201) }],
	])("TEST-03: 400 VALIDATION_ERROR names %s", async (field, body) => {
		const res = await api().post("/api/auth/login").send(body)
		expect(res.status).toBe(400)
		expect(res.body.error.code).toBe("VALIDATION_ERROR")
		expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field)
		expect(await prisma.session.count()).toBe(0)
	})

	it("TEST-03: 400 when the body is missing or not JSON", async () => {
		const missing = await api().post("/api/auth/login")
		const garbage = await api().post("/api/auth/login").set("content-type", "application/json").send("{nope")
		expect(missing.status).toBe(400)
		expect(garbage.status).toBe(400)
		expect(garbage.body.error.code).toBe("VALIDATION_ERROR")
	})

	it("TEST-09: stores only hashes", async () => {
		const res = await api().post("/api/auth/login").send(credentials.BORROWER)
		const user = await prisma.user.findUniqueOrThrow({ where: { email: credentials.BORROWER.email } })
		const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } })
		expect(user.passwordHash).not.toBe(credentials.BORROWER.password)
		expect(session.tokenHash).toBe(hashToken(res.body.token))
		expect(session.tokenHash).not.toBe(res.body.token)
		expect(Object.values(session)).not.toContain(res.body.token)
	})
})

describe("GET /api/auth/me", () => {
	it("TEST-04: returns the user without passwordHash", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await api().get("/api/auth/me").set("Authorization", `Bearer ${token}`)
		expect(res.status).toBe(200)
		expect(Object.keys(res.body)).toEqual(["user"])
		expect(Object.keys(res.body.user).sort()).toEqual(["displayName", "email", "id", "role"])
		expect(JSON.stringify(res.body)).not.toContain("passwordHash")
	})

	it.each([
		["no header", undefined],
		["garbage token", "Bearer garbage"],
		["not a Bearer header", "Basic abc"],
	])("TEST-05: 401 UNAUTHENTICATED with %s", async (_name, header) => {
		const req = api().get("/api/auth/me")
		const res = await (header ? req.set("Authorization", header) : req)
		expect(res.status).toBe(401)
		expect(res.body.error.code).toBe("UNAUTHENTICATED")
		expect(res.body.error.message).toBe("Authentication required.")
		expect(res.body.user).toBeUndefined()
	})

	it("TEST-05: rejects an expired session and deletes its row", async () => {
		const token = await loginAs(app.url, "BORROWER")
		await prisma.session.updateMany({ data: { expiresAt: new Date(TEST_NOW.getTime() - 1000) } })
		const res = await api().get("/api/auth/me").set("Authorization", `Bearer ${token}`)
		expect(res.status).toBe(401)
		expect(res.body.user).toBeUndefined()
		expect(await prisma.session.count()).toBe(0)
	})
})

describe("POST /api/auth/logout", () => {
	it("TEST-06: deletes the session, then the token no longer works", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const out = await api().post("/api/auth/logout").set("Authorization", `Bearer ${token}`)
		expect(out.status).toBe(204)
		expect(out.text).toBe("")
		expect(await prisma.session.count()).toBe(0)
		const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${token}`)
		expect(me.status).toBe(401)
	})

	it("only ends the caller's own session", async () => {
		const borrower = await loginAs(app.url, "BORROWER")
		await loginAs(app.url, "CUSTODIAN")
		await api().post("/api/auth/logout").set("Authorization", `Bearer ${borrower}`)
		expect(await prisma.session.count()).toBe(1)
	})

	it("401 with an invalid token", async () => {
		const res = await api().post("/api/auth/logout").set("Authorization", "Bearer garbage")
		expect(res.status).toBe(401)
	})
})

describe("protected endpoints without a token (TEST-07)", () => {
	const ID = "00000000-0000-4000-8000-000000000000"
	it.each([
		["GET", "/api/auth/me"],
		["POST", "/api/auth/logout"],
	] as const)("%s %s → 401", async (method, path) => {
		const res = await api()[method === "GET" ? "get" : "post"](path)
		expect(res.status).toBe(401)
		expect(Object.keys(res.body)).toEqual(["error"])
		expect(res.body.error.code).toBe("UNAUTHENTICATED")
	})
	// Added by their features: GET /api/items, GET /api/items/:id, POST/GET /api/requests,
	// GET /api/requests/:id, POST /api/requests/:id/approve|reject. Each must be listed here (AC-06).
	it.todo(`F-02..F-05 endpoints (uses ${ID})`)
})

describe("error handler (TEST-10)", () => {
	it("500 INTERNAL_ERROR without internals", async () => {
		const res = await api().get("/api/__test/boom")
		expect(res.status).toBe(500)
		expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } })
		const text = JSON.stringify(res.body)
		for (const leak of ["stack", "xyz", ".ts"]) expect(text).not.toContain(leak)
	})
	it("404 NOT_FOUND in the same shape", async () => {
		const res = await api().get("/api/nope")
		expect(res.status).toBe(404)
		expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Not found." } })
	})
})
