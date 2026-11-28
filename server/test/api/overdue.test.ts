import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loginAs, startTestApp } from "../helpers/app"
import { borrower1, borrower2, insertRequest, itemId, prisma, resetDb } from "../helpers/db"

const app = startTestApp()
const api = () => request(app.url)
const as = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeAll(resetDb)
beforeEach(resetDb)
afterAll(async () => {
	await app.stop()
	await prisma.$disconnect()
})

const token = (who: "BORROWER" | "BORROWER2" | "CUSTODIAN") => loginAs(app.url, who)
const list = async (who: "BORROWER" | "BORROWER2" | "CUSTODIAN", query = "") =>
	api()
		.get(`/api/requests${query}`)
		.set(as(await token(who)))
const create = async (who: "BORROWER" | "BORROWER2", body: object) =>
	api()
		.post("/api/requests")
		.set(as(await token(who)))
		.send(body)
const valid = async (assetTag: string, startDate: string, dueDate: string) => ({
	itemId: await itemId(assetTag),
	startDate,
	dueDate,
	purpose: "Lab work",
})
const returnGood = async (id: string) =>
	api()
		.post(`/api/requests/${id}/return`)
		.set(as(await token("CUSTODIAN")))
		.send({ condition: "GOOD" })
const ids = (body: { id: string }[]) => body.map((r) => r.id)
/** Borrower 1's loan on CPE-0201 from 10 Nov, due 14 Nov: overdue on the test day (15 Nov). */
const overdueLoan = async () => insertRequest("CPE-0201", await borrower1(), "2026-11-10", "2026-11-14", "CHECKED_OUT")

describe("the overdue flag on the request resource (TEST-81, AC-67)", () => {
	it("is true only for a CHECKED_OUT request due before today, in the list, the detail and a new request", async () => {
		const b1 = await borrower1()
		const overdue = await overdueLoan()
		const dueToday = await insertRequest("CPE-0202", b1, "2026-11-10", "2026-11-15", "CHECKED_OUT")
		const approved = await insertRequest("CPE-0203", b1, "2026-11-08", "2026-11-10", "APPROVED")
		const returned = await insertRequest("CPE-0301", b1, "2026-11-08", "2026-11-10", "RETURNED")

		const res = await list("BORROWER")
		expect(res.status).toBe(200)
		const flags = Object.fromEntries(res.body.map((r: { id: string; overdue: boolean }) => [r.id, r.overdue]))
		expect(flags).toEqual({ [overdue.id]: true, [dueToday.id]: false, [approved.id]: false, [returned.id]: false })

		const t = await token("BORROWER")
		expect((await api().get(`/api/requests/${overdue.id}`).set(as(t))).body.overdue).toBe(true)
		expect((await api().get(`/api/requests/${dueToday.id}`).set(as(t))).body.overdue).toBe(false)

		const created = await create("BORROWER2", await valid("CPE-0302", "2026-11-16", "2026-11-17"))
		expect(created.status).toBe(201)
		expect(created.body.overdue).toBe(false)
	})
})

describe("GET /api/requests?overdue=true (TEST-82, AC-68)", () => {
	it("lists overdue loans oldest due date first, all for the Custodian and own for a Borrower", async () => {
		const [b1, b2] = [await borrower1(), await borrower2()]
		const due14 = await insertRequest("CPE-0201", b1, "2026-11-10", "2026-11-14", "CHECKED_OUT")
		const due12 = await insertRequest("CPE-0202", b1, "2026-11-08", "2026-11-12", "CHECKED_OUT")
		const due13 = await insertRequest("CPE-0203", b2, "2026-11-09", "2026-11-13", "CHECKED_OUT")
		await insertRequest("CPE-0301", b2, "2026-11-10", "2026-11-15", "CHECKED_OUT")
		await insertRequest("CPE-0302", b2, "2026-11-08", "2026-11-10", "APPROVED")

		const overdue = await list("CUSTODIAN", "?overdue=true")
		expect(overdue.status).toBe(200)
		expect(ids(overdue.body)).toEqual([due12.id, due13.id, due14.id])
		expect(overdue.body.every((r: { overdue: boolean }) => r.overdue)).toBe(true)

		expect((await list("CUSTODIAN", "?overdue=false")).body).toHaveLength(5)
		expect((await list("CUSTODIAN", "?status=PENDING&overdue=true")).body).toEqual([])
		expect(ids((await list("CUSTODIAN", "?status=CHECKED_OUT&overdue=true")).body)).toEqual([
			due12.id,
			due13.id,
			due14.id,
		])
		expect(ids((await list("BORROWER", "?overdue=true")).body)).toEqual([due12.id, due14.id])
	})
})

describe("GET /api/requests?overdue errors (TEST-83, AC-68)", () => {
	it("400 for an unknown value and 401 without a token", async () => {
		const bad = await list("CUSTODIAN", "?overdue=maybe")
		expect(bad.status).toBe(400)
		expect(bad.body.error.code).toBe("VALIDATION_ERROR")
		expect(bad.body.error.details.map((d: { field: string }) => d.field)).toContain("overdue")

		const anon = await api().get("/api/requests?overdue=true")
		expect(anon.status).toBe(401)
		expect(anon.body.error.code).toBe("UNAUTHENTICATED")
	})
})

describe("BR-08: overdue borrowers are blocked (TEST-84, AC-69)", () => {
	it("409 OVERDUE_BLOCK for a Borrower with an overdue loan; validation first; others and due-today loans pass", async () => {
		const b1 = await borrower1()
		await insertRequest("CPE-0202", b1, "2026-11-10", "2026-11-14", "CHECKED_OUT")
		await insertRequest("CPE-0203", await borrower2(), "2026-11-10", "2026-11-15", "CHECKED_OUT")
		const body = await valid("CPE-0201", "2026-11-16", "2026-11-17")

		const blocked = await create("BORROWER", body)
		expect(blocked.status).toBe(409)
		expect(blocked.body.error).toMatchObject({
			code: "OVERDUE_BLOCK",
			message: "You have an overdue loan. Return it before making a new request.",
		})
		expect(await prisma.borrowRequest.count({ where: { borrowerId: b1 } })).toBe(1)

		const invalid = await create("BORROWER", { ...body, purpose: "" })
		expect(invalid.status).toBe(400)
		expect(invalid.body.error.code).toBe("VALIDATION_ERROR")

		expect((await create("BORROWER2", body)).status).toBe(201)
	})

	it("lifts the block once the overdue loan is returned (TEST-85)", async () => {
		const loan = await insertRequest("CPE-0202", await borrower1(), "2026-11-10", "2026-11-14", "CHECKED_OUT")
		expect((await returnGood(loan.id)).status).toBe(200)

		expect((await create("BORROWER", await valid("CPE-0201", "2026-11-16", "2026-11-17"))).status).toBe(201)
	})
})

describe("BR-03: an overdue loan occupies the item until today", () => {
	it("refuses a new request overlapping today and accepts one from tomorrow (TEST-86, AC-70)", async () => {
		await overdueLoan()

		const clash = await create("BORROWER2", await valid("CPE-0201", "2026-11-15", "2026-11-16"))
		expect(clash.status).toBe(409)
		expect(clash.body.error.code).toBe("PERIOD_UNAVAILABLE")
		expect(await prisma.borrowRequest.count({ where: { borrowerId: await borrower2() } })).toBe(0)

		expect((await create("BORROWER2", await valid("CPE-0201", "2026-11-16", "2026-11-17"))).status).toBe(201)
	})

	it("refuses to approve a pending request overlapping today (TEST-87, AC-71)", async () => {
		await overdueLoan()
		const b2 = await borrower2()
		const clash = await insertRequest("CPE-0201", b2, "2026-11-15", "2026-11-16", "PENDING")
		const later = await insertRequest("CPE-0201", b2, "2026-11-16", "2026-11-17", "PENDING")
		const t = await token("CUSTODIAN")

		const refused = await api().post(`/api/requests/${clash.id}/approve`).set(as(t))
		expect(refused.status).toBe(409)
		expect(refused.body.error.code).toBe("PERIOD_UNAVAILABLE")
		expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: clash.id } })).status).toBe("PENDING")

		const approved = await api().post(`/api/requests/${later.id}/approve`).set(as(t))
		expect(approved.status).toBe(200)
		expect(approved.body.status).toBe("APPROVED")
	})

	it("refuses to check out another request on the item until the loan is returned (TEST-88, AC-72)", async () => {
		const loan = await overdueLoan()
		const next = await insertRequest("CPE-0201", await borrower2(), "2026-11-15", "2026-11-17", "APPROVED")
		const t = await token("CUSTODIAN")
		const checkout = () => api().post(`/api/requests/${next.id}/checkout`).set(as(t))

		const refused = await checkout()
		expect(refused.status).toBe(409)
		expect(refused.body.error).toMatchObject({
			code: "PERIOD_UNAVAILABLE",
			message: "This item is still checked out on another loan.",
		})
		expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("APPROVED")

		expect((await returnGood(loan.id)).status).toBe(200)
		const ok = await checkout()
		expect(ok.status).toBe(200)
		expect(ok.body.status).toBe("CHECKED_OUT")
	})
})

describe("the catalog counts an overdue loan as booked (TEST-89, AC-73, F-02 v0.3)", () => {
	it("availableToday is false and committedPeriods lists the loan until it is returned", async () => {
		const loan = await overdueLoan()
		await insertRequest("CPE-0201", await borrower2(), "2026-11-20", "2026-11-22", "APPROVED")
		const id = await itemId("CPE-0201")
		const t = await token("CUSTODIAN")
		const listed = async () =>
			(await api().get("/api/items").set(as(t))).body.find((i: { id: string }) => i.id === id).availableToday
		const detail = async () => (await api().get(`/api/items/${id}`).set(as(t))).body

		expect(await listed()).toBe(false)
		const before = await detail()
		expect(before.availableToday).toBe(false)
		expect(before.committedPeriods).toMatchObject([
			{ startDate: "2026-11-10", dueDate: "2026-11-14", status: "CHECKED_OUT", overdue: true },
			{ startDate: "2026-11-20", dueDate: "2026-11-22", status: "APPROVED", overdue: false },
		])

		expect((await returnGood(loan.id)).status).toBe(200)
		expect(await listed()).toBe(true)
		const after = await detail()
		expect(after.availableToday).toBe(true)
		expect(after.committedPeriods).toMatchObject([{ startDate: "2026-11-20", overdue: false }])
		expect(after.committedPeriods).toHaveLength(1)
	})
})
