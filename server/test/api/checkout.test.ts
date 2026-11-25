import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loginAs, startTestApp } from "../helpers/app"
import { borrower1, insertRequest, prisma, resetDb } from "../helpers/db"

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
const custodianToken = () => loginAs(app.url, "CUSTODIAN")
const checkout = (token: string, id: string) => api().post(`/api/requests/${id}/checkout`).set(as(token))
const doReturn = (token: string, id: string, body: object = { condition: "GOOD" }) =>
	api().post(`/api/requests/${id}/return`).set(as(token)).send(body)
const row = (id: string) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } })
const custodianId = async () => (await prisma.user.findUniqueOrThrow({ where: { email: "custodian@example.test" } })).id

describe("POST /api/requests/:id/checkout (TEST-65, AC-55)", () => {
	it("200 CHECKED_OUT with checkedOutBy and checkedOutAt; the DB row matches and the item stays ACTIVE", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-15", "2026-11-20", "APPROVED")
		const untouched = await insertRequest("CPE-0202", await borrower1(), "2026-11-15", "2026-11-20", "APPROVED")
		const token = await custodianToken()

		const res = await checkout(token, r.id)

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({
			id: r.id,
			status: "CHECKED_OUT",
			checkedOutBy: { id: await custodianId(), displayName: "Custodian" },
			returnedTo: null,
			returnedAt: null,
			returnCondition: null,
			returnNote: null,
		})
		expect(new Date(res.body.checkedOutAt).toISOString()).toBe("2026-11-15T05:00:00.000Z") // the test clock
		expect(await row(r.id)).toMatchObject({
			status: "CHECKED_OUT",
			checkedOutById: await custodianId(),
			checkedOutAt: new Date("2026-11-15T05:00:00Z"),
		})
		expect((await prisma.item.findUniqueOrThrow({ where: { assetTag: "CPE-0201" } })).status).toBe("ACTIVE")

		const list = await api().get("/api/requests").set(as(token))
		expect(list.body.find((x: { id: string }) => x.id === r.id).status).toBe("CHECKED_OUT")
		expect(list.body.find((x: { id: string }) => x.id === untouched.id)).toMatchObject({
			status: "APPROVED",
			checkedOutBy: null,
			checkedOutAt: null,
			returnedTo: null,
			returnCondition: null,
		})
	})
})

describe("the checkout window (TEST-67, AC-56, BR-09)", () => {
	it("allows start = today and due = today; refuses an early or late checkout and leaves those rows unchanged", async () => {
		const b1 = await borrower1()
		const startsToday = await insertRequest("CPE-0201", b1, "2026-11-15", "2026-11-20", "APPROVED")
		const dueToday = await insertRequest("CPE-0202", b1, "2026-11-10", "2026-11-15", "APPROVED")
		const early = await insertRequest("CPE-0203", b1, "2026-11-16", "2026-11-20", "APPROVED")
		const late = await insertRequest("CPE-0301", b1, "2026-11-10", "2026-11-14", "APPROVED")
		const token = await custodianToken()

		expect((await checkout(token, startsToday.id)).status).toBe(200)
		expect((await checkout(token, dueToday.id)).status).toBe(200)

		const tooEarly = await checkout(token, early.id)
		expect(tooEarly.status).toBe(409)
		expect(tooEarly.body.error.code).toBe("INVALID_TRANSITION")
		expect(tooEarly.body.error.message).toContain("2026-11-16")

		const tooLate = await checkout(token, late.id)
		expect(tooLate.status).toBe(409)
		expect(tooLate.body.error.code).toBe("INVALID_TRANSITION")
		expect(tooLate.body.error.message).toContain("can only be cancelled")

		for (const id of [early.id, late.id]) {
			expect(await row(id)).toMatchObject({ status: "APPROVED", checkedOutAt: null, checkedOutById: null })
		}
	})
})

describe("requests that cannot be checked out (TEST-68, AC-57)", () => {
	it.each(["PENDING", "REJECTED", "CANCELLED", "CHECKED_OUT", "RETURNED"] as const)(
		"%s -> 409 INVALID_TRANSITION and the row is unchanged",
		async (status) => {
			const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-10", "2026-11-20", status)
			const before = await row(r.id)

			const res = await checkout(await custodianToken(), r.id)

			expect(res.status).toBe(409)
			expect(res.body.error.code).toBe("INVALID_TRANSITION")
			expect(await row(r.id)).toEqual(before)
		}
	)

	it("an APPROVED request in its window on a MAINTENANCE item -> 409 ITEM_NOT_AVAILABLE and the row is unchanged", async () => {
		const r = await insertRequest("CPE-0901", await borrower1(), "2026-11-15", "2026-11-20", "APPROVED")
		const before = await row(r.id)

		const res = await checkout(await custodianToken(), r.id)

		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("ITEM_NOT_AVAILABLE")
		expect(res.body.error.message).toBe("This item is under maintenance, so it cannot be handed over.")
		expect(await row(r.id)).toEqual(before)
	})
})

describe("who may check out or return (TEST-69, AC-58)", () => {
	it("403 for a Borrower, 401 without a token, 404 for an unknown or malformed id; nothing changes", async () => {
		const approved = await insertRequest("CPE-0201", await borrower1(), "2026-11-15", "2026-11-20", "APPROVED")
		const out = await insertRequest("CPE-0202", await borrower1(), "2026-11-10", "2026-11-20", "CHECKED_OUT")
		const [beforeA, beforeC] = [await row(approved.id), await row(out.id)]
		const borrower = await borrowerToken()
		const custodian = await custodianToken()

		expect((await checkout(borrower, approved.id)).status).toBe(403)
		expect((await doReturn(borrower, out.id)).status).toBe(403)
		// The role guard runs before body validation, so a bad body is still 403, not 400.
		expect((await doReturn(borrower, out.id, {})).status).toBe(403)

		expect((await api().post(`/api/requests/${approved.id}/checkout`)).status).toBe(401)
		expect((await api().post(`/api/requests/${out.id}/return`).send({ condition: "GOOD" })).status).toBe(401)

		for (const id of ["00000000-0000-4000-8000-000000000000", "abc"]) {
			expect((await checkout(custodian, id)).status).toBe(404)
			expect((await doReturn(custodian, id)).status).toBe(404)
		}

		expect(await row(approved.id)).toEqual(beforeA)
		expect(await row(out.id)).toEqual(beforeC)
	})
})

describe("checkout at the same moment as something else (TEST-70, AC-59)", () => {
	it("two checkouts: exactly one 200 and one 409; one checkedOutAt", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-15", "2026-11-20", "APPROVED")
		const token = await custodianToken()

		const results = await Promise.all([checkout(token, r.id), checkout(token, r.id)])

		expect(results.map((x) => x.status).sort()).toEqual([200, 409])
		expect(results.find((x) => x.status === 409)!.body.error.code).toBe("INVALID_TRANSITION")
		expect(await row(r.id)).toMatchObject({
			status: "CHECKED_OUT",
			checkedOutAt: new Date("2026-11-15T05:00:00Z"),
		})
	})

	it("a checkout and the Borrower's cancel: exactly one wins and the row agrees with the winner", async () => {
		const r = await insertRequest("CPE-0201", await borrower1(), "2026-11-15", "2026-11-20", "APPROVED")
		const [custodian, borrower] = [await custodianToken(), await borrowerToken()]

		const [out, cancelled] = await Promise.all([
			checkout(custodian, r.id),
			api().post(`/api/requests/${r.id}/cancel`).set(as(borrower)),
		])

		expect([out.status, cancelled.status].sort()).toEqual([200, 409])
		const after = await row(r.id)
		if (out.status === 200) {
			expect(after).toMatchObject({ status: "CHECKED_OUT", cancelledAt: null })
		} else {
			expect(after).toMatchObject({ status: "CANCELLED", checkedOutAt: null, checkedOutById: null })
		}
	})
})
