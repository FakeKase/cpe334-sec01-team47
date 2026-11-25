import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loginAs, startTestApp } from "../helpers/app"
import { borrower1, insertRequest, itemId, prisma, resetDb } from "../helpers/db"

const app = startTestApp()
const api = () => request(app.url)
const as = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeAll(resetDb)
beforeEach(resetDb)
afterAll(async () => {
	await app.stop()
	await prisma.$disconnect()
})

const borrower2Token = () => loginAs(app.url, "BORROWER2")
const custodianToken = () => loginAs(app.url, "CUSTODIAN")
const doReturn = (token: string, id: string, body: object = { condition: "GOOD" }) =>
	api().post(`/api/requests/${id}/return`).set(as(token)).send(body)
const row = (id: string) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } })
const itemStatus = async (assetTag: string) => (await prisma.item.findUniqueOrThrow({ where: { assetTag } })).status
const custodianId = async () => (await prisma.user.findUniqueOrThrow({ where: { email: "custodian@example.test" } })).id
const create = async (token: string, assetTag: string, startDate: string, dueDate: string) =>
	api()
		.post("/api/requests")
		.set(as(token))
		.send({ itemId: await itemId(assetTag), startDate, dueDate, purpose: "Lab work" })

describe("POST /api/requests/:id/return with GOOD (TEST-71, AC-60)", () => {
	it("200 RETURNED, trims the note, stores a blank note as null, keeps the item ACTIVE and frees the period", async () => {
		const b1 = await borrower1()
		const r = await insertRequest("CPE-0201", b1, "2026-11-15", "2026-11-20", "CHECKED_OUT")
		const blank = await insertRequest("CPE-0202", b1, "2026-11-15", "2026-11-20", "CHECKED_OUT")
		const token = await custodianToken()

		const res = await doReturn(token, r.id, { condition: "GOOD", note: "  Cable included  " })
		const res2 = await doReturn(token, blank.id, { condition: "GOOD", note: "   " })

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({
			id: r.id,
			status: "RETURNED",
			returnedTo: { id: await custodianId(), displayName: "Custodian" },
			returnCondition: "GOOD",
			returnNote: "Cable included",
		})
		expect(new Date(res.body.returnedAt).toISOString()).toBe("2026-11-15T05:00:00.000Z")
		expect(await row(r.id)).toMatchObject({
			status: "RETURNED",
			returnedToId: await custodianId(),
			returnCondition: "GOOD",
			returnNote: "Cable included",
		})
		expect(res2.status).toBe(200)
		expect(res2.body.returnNote).toBeNull()
		expect(await itemStatus("CPE-0201")).toBe("ACTIVE")
		expect(await itemStatus("CPE-0202")).toBe("ACTIVE")

		// BR-03: RETURNED no longer occupies the item.
		const b2 = await borrower2Token()
		const created = await create(b2, "CPE-0201", "2026-11-16", "2026-11-18")
		expect(created.status).toBe(201)
		expect((await api().post(`/api/requests/${created.body.id}/approve`).set(as(token))).status).toBe(200)
	})
})

describe("returning a DAMAGED item (TEST-72, AC-61, BR-10)", () => {
	it("200 RETURNED and the item becomes MAINTENANCE, so it can no longer be requested", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-15", "2026-11-20", "CHECKED_OUT")
		const token = await custodianToken()

		const res = await doReturn(token, r.id, { condition: "DAMAGED", note: "Probe tip bent" })

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ status: "RETURNED", returnCondition: "DAMAGED", returnNote: "Probe tip bent" })
		expect(await itemStatus("CPE-0201")).toBe("MAINTENANCE")

		const items = await api().get("/api/items").set(as(token))
		expect(items.body.find((i: { assetTag: string }) => i.assetTag === "CPE-0201")).toMatchObject({
			status: "MAINTENANCE",
			availableToday: false,
		})

		const created = await create(await borrower2Token(), "CPE-0201", "2026-11-16", "2026-11-18")
		expect(created.status).toBe(409)
		expect(created.body.error.code).toBe("ITEM_NOT_AVAILABLE")
	})
})

describe("return validation (TEST-73, AC-62)", () => {
	it("400 names the field for a missing, empty or unknown condition and a 501-character note; 500 is accepted", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-15", "2026-11-20", "CHECKED_OUT")
		const token = await custodianToken()
		const fieldOf = (res: request.Response) => res.body.error.details.map((d: { field: string }) => d.field)

		for (const body of [{}, { condition: "" }, { condition: "BROKEN" }]) {
			const res = await doReturn(token, r.id, body)
			expect(res.status).toBe(400)
			expect(res.body.error.code).toBe("VALIDATION_ERROR")
			expect(fieldOf(res)).toContain("condition")
		}
		const long = await doReturn(token, r.id, { condition: "DAMAGED", note: "a".repeat(501) })
		expect(long.status).toBe(400)
		expect(fieldOf(long)).toContain("note")

		expect(await row(r.id)).toMatchObject({ status: "CHECKED_OUT", returnedAt: null })
		expect(await itemStatus("CPE-0201")).toBe("ACTIVE")

		expect((await doReturn(token, r.id, { condition: "GOOD", note: "a".repeat(500) })).status).toBe(200)
	})
})

describe("requests that cannot be returned (TEST-74, AC-63)", () => {
	it.each(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "RETURNED"] as const)(
		"%s -> 409 INVALID_TRANSITION; neither the request nor the item changes",
		async (status) => {
			const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-10", "2026-11-20", status)
			const before = await row(r.id)

			const res = await doReturn(await custodianToken(), r.id, { condition: "DAMAGED" })

			expect(res.status).toBe(409)
			expect(res.body.error.code).toBe("INVALID_TRANSITION")
			expect(res.body.error.message).toBe("Only checked-out requests can be returned.")
			expect(await row(r.id)).toEqual(before)
			expect(await itemStatus("CPE-0201")).toBe("ACTIVE")
		}
	)

	it("a CHECKED_OUT loan whose due date has passed can still be returned", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-05", "2026-11-10", "CHECKED_OUT")
		const res = await doReturn(await custodianToken(), r.id)
		expect(res.status).toBe(200)
		expect(res.body.status).toBe("RETURNED")
	})
})

describe("two returns at the same moment (TEST-70, AC-59)", () => {
	it("exactly one 200 and one 409; one returnedAt", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-15", "2026-11-20", "CHECKED_OUT")
		const token = await custodianToken()

		const results = await Promise.all([doReturn(token, r.id), doReturn(token, r.id, { condition: "DAMAGED" })])

		expect(results.map((x) => x.status).sort()).toEqual([200, 409])
		expect(results.find((x) => x.status === 409)!.body.error.code).toBe("INVALID_TRANSITION")
		const after = await row(r.id)
		expect(after).toMatchObject({ status: "RETURNED", returnedAt: new Date("2026-11-15T05:00:00Z") })
		// The item follows the call that won, never the one that lost.
		expect(await itemStatus("CPE-0201")).toBe(after.returnCondition === "DAMAGED" ? "MAINTENANCE" : "ACTIVE")
	})
})
