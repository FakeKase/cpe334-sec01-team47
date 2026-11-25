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

const borrowerToken = () => loginAs(app.url, "BORROWER")
const borrower2Token = () => loginAs(app.url, "BORROWER2")
const custodianToken = () => loginAs(app.url, "CUSTODIAN")
const cancel = (token: string, id: string) => api().post(`/api/requests/${id}/cancel`).set(as(token))
const row = (id: string) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } })
const create = async (token: string, assetTag: string, startDate: string, dueDate: string) =>
	api()
		.post("/api/requests")
		.set(as(token))
		.send({ itemId: await itemId(assetTag), startDate, dueDate, purpose: "Lab work" })

describe("POST /api/requests/:id/cancel on a PENDING request (TEST-42, AC-36)", () => {
	it("200 CANCELLED with cancelledAt; the DB row matches and the list shows CANCELLED", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-20", "2026-11-22", "PENDING")
		const token = await borrowerToken()

		const res = await cancel(token, r.id)

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ id: r.id, status: "CANCELLED", decidedBy: null, decidedAt: null })
		expect(new Date(res.body.cancelledAt).toISOString()).toBe("2026-11-15T05:00:00.000Z") // the test clock
		expect(await row(r.id)).toMatchObject({
			status: "CANCELLED",
			cancelledAt: new Date("2026-11-15T05:00:00Z"),
			decidedById: null,
			decidedAt: null,
		})

		const list = await api().get("/api/requests").set(as(token))
		expect(list.body).toEqual([expect.objectContaining({ id: r.id, status: "CANCELLED" })])
	})

	it("an untouched request has cancelledAt null in the resource", async () => {
		await insertRequest("CPE-0201", await borrower1(), "2026-11-20", "2026-11-22", "PENDING")
		const list = await api()
			.get("/api/requests")
			.set(as(await borrowerToken()))
		expect(list.body[0]).toHaveProperty("cancelledAt", null)
	})
})

describe("cancelling an APPROVED request frees the period and the active slot (TEST-43, AC-37)", () => {
	it("Borrower 2 can then request and be approved for an overlapping period", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-20", "2026-11-22", "APPROVED")
		const blocked = await create(await borrower2Token(), "CPE-0201", "2026-11-21", "2026-11-23")
		expect(blocked.body.error.code).toBe("PERIOD_UNAVAILABLE")

		expect((await cancel(await borrowerToken(), r.id)).status).toBe(200)

		const created = await create(await borrower2Token(), "CPE-0201", "2026-11-21", "2026-11-23")
		expect(created.status).toBe(201)
		const approved = await api()
			.post(`/api/requests/${created.body.id}/approve`)
			.set(as(await custodianToken()))
		expect(approved.status).toBe(200)
	})

	it("a Borrower at the limit of 3 active requests can create another after cancelling one", async () => {
		const mine = await borrower1()
		const first = await insertRequest("CPE-0201", mine, "2026-11-20", "2026-11-22", "PENDING")
		await insertRequest("CPE-0202", mine, "2026-11-20", "2026-11-22", "PENDING")
		await insertRequest("CPE-0203", mine, "2026-11-20", "2026-11-22", "APPROVED")
		const token = await borrowerToken()
		expect((await create(token, "CPE-0301", "2026-11-20", "2026-11-22")).body.error.code).toBe("ACTIVE_LIMIT_REACHED")

		expect((await cancel(token, first.id)).status).toBe(200)

		expect((await create(token, "CPE-0301", "2026-11-20", "2026-11-22")).status).toBe(201)
	})
})

describe("an APPROVED request whose due date has passed can still be cancelled (TEST-44, AC-38, BR-09)", () => {
	it("200 CANCELLED for 10-12 Nov when today is 15 Nov", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-10", "2026-11-12", "APPROVED")
		const res = await cancel(await borrowerToken(), r.id)
		expect(res.status).toBe(200)
		expect(res.body.status).toBe("CANCELLED")
	})
})

describe("requests that cannot be cancelled (TEST-45, AC-39)", () => {
	const cancelledAt = new Date("2026-11-13T04:00:00Z")
	it.each([
		{ status: "REJECTED", extra: { rejectionReason: "Exam week" } },
		{ status: "CANCELLED", extra: { cancelledAt } },
		{ status: "CHECKED_OUT", extra: {} },
		{ status: "RETURNED", extra: {} },
	] as const)("$status -> 409 INVALID_TRANSITION and the row is unchanged", async ({ status, extra }) => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-10", "2026-11-12", status, extra)
		const before = await row(r.id)

		const res = await cancel(await borrowerToken(), r.id)

		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("INVALID_TRANSITION")
		expect(await row(r.id)).toEqual(before)
	})
})

describe("roles, ownership and ids (TEST-46, AC-40)", () => {
	it("404 for another Borrower's request, 403 for the Custodian, 401 without a token; the row is unchanged", async () => {
		const r = await insertRequest("CPE-0201", await borrower2(), "2026-11-20", "2026-11-22", "PENDING")
		const before = await row(r.id)

		const other = await cancel(await borrowerToken(), r.id)
		expect(other.status).toBe(404)
		expect(other.body.error.code).toBe("NOT_FOUND")
		expect(Object.keys(other.body)).toEqual(["error"])

		const staff = await cancel(await custodianToken(), r.id)
		expect(staff.status).toBe(403)
		expect(staff.body.error.code).toBe("FORBIDDEN")

		const anon = await api().post(`/api/requests/${r.id}/cancel`)
		expect(anon.status).toBe(401)
		expect(anon.body.error.code).toBe("UNAUTHENTICATED")

		expect(await row(r.id)).toEqual(before)
	})

	it.each(["00000000-0000-4000-8000-000000000000", "abc"])("404 for the id %s", async (id) => {
		const res = await cancel(await borrowerToken(), id)
		expect(res.status).toBe(404)
		expect(res.body.error.code).toBe("NOT_FOUND")
	})
})

describe("two cancels at the same moment (TEST-47, AC-41)", () => {
	it("exactly one 200 and one 409; the row is CANCELLED once", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-20", "2026-11-22", "PENDING")
		const token = await borrowerToken()

		const results = await Promise.all([cancel(token, r.id), cancel(token, r.id)])

		expect(results.map((x) => x.status).sort()).toEqual([200, 409])
		expect(results.find((x) => x.status === 409)!.body.error.code).toBe("INVALID_TRANSITION")
		expect(await row(r.id)).toMatchObject({ status: "CANCELLED", cancelledAt: new Date("2026-11-15T05:00:00Z") })
	})
})
