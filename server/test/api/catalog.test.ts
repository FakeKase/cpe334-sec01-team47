import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loginAs, startTestApp } from "../helpers/app"
import { prisma, resetDb } from "../helpers/db"

const app = startTestApp()
const api = () => request(app.url)
const as = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeAll(resetDb)
beforeEach(resetDb)
afterAll(async () => {
	await app.stop()
	await prisma.$disconnect()
})

const itemByTag = (assetTag: string) => prisma.item.findUniqueOrThrow({ where: { assetTag } })

describe("GET /api/items (TEST-12)", () => {
	it("lists the 11 non-retired items with the documented keys", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await api().get("/api/items").set(as(token))
		expect(res.status).toBe(200)
		expect(res.body).toHaveLength(11)
		expect(res.body.map((i: { assetTag: string }) => i.assetTag)).not.toContain("CPE-0999")
		for (const item of res.body) {
			expect(Object.keys(item).sort()).toEqual(["assetTag", "availableToday", "category", "id", "name", "status"])
			expect(Object.keys(item.category).sort()).toEqual(["id", "name"])
		}
		const maintenance = res.body.find((i: { assetTag: string }) => i.assetTag === "CPE-0901")
		expect(maintenance).toMatchObject({ status: "MAINTENANCE", availableToday: false })
	})

	it("is ordered by name then asset tag", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await api().get("/api/items").set(as(token))
		const keys = res.body.map((i: { name: string; assetTag: string }) => `${i.name}|${i.assetTag}`)
		expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : 1)))
	})

	it("availableToday is false while an APPROVED request covers today", async () => {
		const borrower = await prisma.user.findUniqueOrThrow({ where: { email: "borrower2@example.test" } })
		const item = await itemByTag("CPE-0202")
		await prisma.borrowRequest.create({
			data: {
				itemId: item.id,
				borrowerId: borrower.id,
				startDate: new Date("2026-11-15"),
				dueDate: new Date("2026-11-16"),
				purpose: "x",
				status: "APPROVED",
			},
		})
		const token = await loginAs(app.url, "BORROWER")
		const res = await api().get("/api/items").set(as(token))
		const found = res.body.find((i: { assetTag: string }) => i.assetTag === "CPE-0202")
		expect(found.availableToday).toBe(false)
		expect(found.status).toBe("ACTIVE")
	})
})

describe("GET /api/items?categoryId (TEST-13)", () => {
	it("filters by category, returns [] for an unknown UUID and 400 for a non-UUID", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const measurement = await prisma.category.findUniqueOrThrow({ where: { name: "Measurement instruments" } })

		const some = await api().get("/api/items").query({ categoryId: measurement.id }).set(as(token))
		expect(some.status).toBe(200)
		expect(some.body.length).toBeGreaterThan(0)
		for (const i of some.body) expect(i.category.id).toBe(measurement.id)

		const none = await api().get("/api/items").query({ categoryId: crypto.randomUUID() }).set(as(token))
		expect(none.status).toBe(200)
		expect(none.body).toEqual([])

		const bad = await api().get("/api/items").query({ categoryId: "abc" }).set(as(token))
		expect(bad.status).toBe(400)
		expect(bad.body.error.code).toBe("VALIDATION_ERROR")
	})
})

describe("GET /api/items/:id (TEST-14)", () => {
	async function bookItemX() {
		const item = await itemByTag("CPE-0201")
		const other = await prisma.user.findUniqueOrThrow({ where: { email: "borrower2@example.test" } })
		const row = (status: "APPROVED" | "PENDING" | "RETURNED", start: string, due: string) => ({
			itemId: item.id,
			borrowerId: other.id,
			startDate: new Date(start),
			dueDate: new Date(due),
			purpose: "x",
			status,
		})
		await prisma.borrowRequest.createMany({
			data: [
				row("APPROVED", "2026-11-20", "2026-11-22"),
				row("PENDING", "2026-11-25", "2026-11-26"),
				row("RETURNED", "2026-11-01", "2026-11-03"),
			],
		})
		return item
	}

	it("returns only the APPROVED period; borrower name is for Custodians only", async () => {
		const item = await bookItemX()
		const borrower = await loginAs(app.url, "BORROWER")
		const custodian = await loginAs(app.url, "CUSTODIAN")

		const b = await api().get(`/api/items/${item.id}`).set(as(borrower))
		expect(b.status).toBe(200)
		expect(b.body).toMatchObject({ assetTag: "CPE-0201", status: "ACTIVE", availableToday: true })
		expect(Object.keys(b.body).sort()).toEqual([
			"assetTag",
			"availableToday",
			"category",
			"committedPeriods",
			"description",
			"id",
			"location",
			"name",
			"status",
		])
		expect(b.body.committedPeriods).toEqual([{ startDate: "2026-11-20", dueDate: "2026-11-22", status: "APPROVED" }])

		const c = await api().get(`/api/items/${item.id}`).set(as(custodian))
		expect(c.body.committedPeriods).toEqual([
			{ startDate: "2026-11-20", dueDate: "2026-11-22", status: "APPROVED", borrower: { displayName: "Borrower Two" } },
		])
	})

	it("404 for an unknown id, a non-UUID and a retired item", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const retired = await itemByTag("CPE-0999")
		for (const id of [crypto.randomUUID(), "abc", retired.id]) {
			const res = await api().get(`/api/items/${id}`).set(as(token))
			expect(res.status).toBe(404)
			expect(res.body.error.code).toBe("NOT_FOUND")
		}
	})
})

describe("GET /api/categories (TEST-15)", () => {
	it("is public: 4 categories sorted by name", async () => {
		const res = await api().get("/api/categories")
		expect(res.status).toBe(200)
		const names = res.body.map((c: { name: string }) => c.name)
		expect(names).toHaveLength(4)
		expect(names).toEqual([...names].sort())
		expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"])
	})
})

describe("auth on catalog endpoints (TEST-07)", () => {
	it.each(["/api/items", `/api/items/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}`])(
		"GET %s without a token → 401",
		async (path) => {
			const res = await api().get(path)
			expect(res.status).toBe(401)
			expect(res.body.error.code).toBe("UNAUTHENTICATED")
		}
	)
})
