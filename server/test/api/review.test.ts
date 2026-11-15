import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loginAs, startTestApp } from "../helpers/app"
import { borrower1, borrower2, insertRequest, prisma, resetDb, userId } from "../helpers/db"

const app = startTestApp()
const api = () => request(app.url)
const as = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeAll(resetDb)
beforeEach(resetDb)
afterAll(async () => {
	await app.stop()
	await prisma.$disconnect()
})

const custodian = () => loginAs(app.url, "CUSTODIAN")
const approve = (token: string, id: string) => api().post(`/api/requests/${id}/approve`).set(as(token))
const reject = (token: string, id: string, reason: unknown) =>
	api().post(`/api/requests/${id}/reject`).set(as(token)).send({ reason })
const row = (id: string) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } })
const pendingOn = async (assetTag: string, startDate: string, dueDate: string, borrowerId?: string) =>
	insertRequest(assetTag, borrowerId ?? (await borrower1()), startDate, dueDate, "PENDING")
const fields = (res: { body: { error: { details?: { field: string }[] } } }) =>
	(res.body.error.details ?? []).map((d) => d.field)

/** The decision columns are untouched. */
async function expectUnchanged(id: string) {
	expect(await row(id)).toMatchObject({ status: "PENDING", decidedById: null, decidedAt: null, rejectionReason: null })
}

describe("GET /api/requests?status=PENDING is the Custodian's queue, oldest first (TEST-31, AC-27)", () => {
	it("returns [Ra, Rb] with borrower names; the APPROVED Rc is absent", async () => {
		const ra = await insertRequest("CPE-0201", await borrower1(), "2026-11-20", "2026-11-22", "PENDING", {
			createdAt: new Date("2026-11-10T03:00:00Z"),
		})
		const rb = await insertRequest("CPE-0202", await borrower2(), "2026-11-20", "2026-11-22", "PENDING", {
			createdAt: new Date("2026-11-11T03:00:00Z"),
		})
		await insertRequest("CPE-0203", await borrower1(), "2026-11-20", "2026-11-22", "APPROVED", {
			createdAt: new Date("2026-11-09T03:00:00Z"),
		})

		const res = await api()
			.get("/api/requests?status=PENDING")
			.set(as(await custodian()))

		expect(res.status).toBe(200)
		expect(res.body.map((r: { id: string }) => r.id)).toEqual([ra.id, rb.id])
		expect(res.body.map((r: { borrower: { displayName: string } }) => r.borrower.displayName)).toEqual([
			"Borrower One",
			"Borrower Two",
		])
	})
})

describe("POST /api/requests/:id/approve (TEST-32, AC-28)", () => {
	it("200 APPROVED with decidedBy and decidedAt; the DB row matches and the Borrower sees APPROVED", async () => {
		const ra = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const custodianId = await userId("custodian@example.test")

		const res = await approve(await custodian(), ra.id)

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({
			id: ra.id,
			status: "APPROVED",
			decidedBy: { id: custodianId, displayName: expect.any(String) },
			rejectionReason: null,
		})
		expect(new Date(res.body.decidedAt).toISOString()).toBe("2026-11-15T05:00:00.000Z") // the test clock
		expect(await row(ra.id)).toMatchObject({ status: "APPROVED", decidedById: custodianId })

		const mine = await api()
			.get(`/api/requests/${ra.id}`)
			.set(as(await loginAs(app.url, "BORROWER")))
		expect(mine.body.status).toBe("APPROVED")
	})

	it("approving a request whose start date has passed is allowed while dueDate >= today", async () => {
		const r = await pendingOn("CPE-0201", "2026-11-14", "2026-11-15")
		const res = await approve(await custodian(), r.id)
		expect(res.status).toBe(200)
		expect(res.body.status).toBe("APPROVED")
	})
})

describe("BR-03 is re-checked on approve (TEST-33, AC-29)", () => {
	it("after A (20-22) is approved, approving B (21-23) -> 409 PERIOD_UNAVAILABLE and B stays PENDING", async () => {
		const a = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const b = await pendingOn("CPE-0201", "2026-11-21", "2026-11-23", await borrower2())
		const token = await custodian()

		expect((await approve(token, a.id)).status).toBe(200)
		const res = await approve(token, b.id)

		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("PERIOD_UNAVAILABLE")
		await expectUnchanged(b.id)
	})

	it("a CHECKED_OUT period blocks too, and an adjacent period does not", async () => {
		await insertRequest("CPE-0201", await borrower2(), "2026-11-16", "2026-11-19", "CHECKED_OUT")
		const clash = await pendingOn("CPE-0201", "2026-11-19", "2026-11-20")
		const after = await insertRequest("CPE-0201", await borrower2(), "2026-11-20", "2026-11-22", "PENDING")
		const token = await custodian()

		expect((await approve(token, clash.id)).body.error.code).toBe("PERIOD_UNAVAILABLE")
		expect((await approve(token, after.id)).status).toBe(200)
	})
})

describe("BR-02 is re-checked on approve (TEST-34, AC-30)", () => {
	it.each(["MAINTENANCE", "RETIRED"] as const)(
		"an item set to %s after submission -> 409 ITEM_NOT_AVAILABLE, request stays PENDING",
		async (status) => {
			const ra = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
			await prisma.item.update({ where: { assetTag: "CPE-0201" }, data: { status } })

			const res = await approve(await custodian(), ra.id)

			expect(res.status).toBe(409)
			expect(res.body.error.code).toBe("ITEM_NOT_AVAILABLE")
			await expectUnchanged(ra.id)
		}
	)
})

describe("POST /api/requests/:id/reject (TEST-35, AC-31)", () => {
	it("stores the trimmed reason and returns 200 REJECTED", async () => {
		const ra = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const custodianId = await userId("custodian@example.test")

		const res = await reject(await custodian(), ra.id, "  Exam week  ")

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ status: "REJECTED", rejectionReason: "Exam week", decidedBy: { id: custodianId } })
		expect(await row(ra.id)).toMatchObject({
			status: "REJECTED",
			rejectionReason: "Exam week",
			decidedById: custodianId,
			decidedAt: new Date("2026-11-15T05:00:00Z"),
		})
	})

	it.each([
		["empty", ""],
		["blank", "   "],
		["501 characters", "a".repeat(501)],
		["missing", undefined],
		["not a string", 42],
	])("400 VALIDATION_ERROR (reason) for a %s reason; the request stays PENDING", async (_, reason) => {
		const rb = await pendingOn("CPE-0202", "2026-11-20", "2026-11-22")

		const res = await reject(await custodian(), rb.id, reason)

		expect(res.status).toBe(400)
		expect(res.body.error.code).toBe("VALIDATION_ERROR")
		expect(fields(res)).toContain("reason")
		await expectUnchanged(rb.id)
	})

	it("accepts exactly 500 characters", async () => {
		const r = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const res = await reject(await custodian(), r.id, "a".repeat(500))
		expect(res.status).toBe(200)
	})
})

describe("only PENDING requests can be decided (TEST-37, AC-32)", () => {
	it("409 INVALID_TRANSITION x4, each unchanged; rejecting the expired PENDING request -> 200", async () => {
		const b1 = await borrower1()
		const ra = await insertRequest("CPE-0201", b1, "2026-11-20", "2026-11-22", "APPROVED")
		const rb = await insertRequest("CPE-0202", b1, "2026-11-20", "2026-11-22", "REJECTED", {
			rejectionReason: "Exam week",
		})
		const rc = await insertRequest("CPE-0203", b1, "2026-11-10", "2026-11-12", "PENDING")
		const token = await custodian()

		for (const res of [
			await approve(token, ra.id),
			await reject(token, ra.id, "Too late"),
			await approve(token, rb.id),
			await approve(token, rc.id),
		]) {
			expect(res.status).toBe(409)
			expect(res.body.error.code).toBe("INVALID_TRANSITION")
		}
		expect((await row(ra.id)).status).toBe("APPROVED")
		expect(await row(rb.id)).toMatchObject({ status: "REJECTED", rejectionReason: "Exam week" })
		await expectUnchanged(rc.id)

		const late = await reject(token, rc.id, "Period has ended")
		expect(late.status).toBe(200)
		expect(late.body.status).toBe("REJECTED")
	})

	it("uses the contract messages", async () => {
		const b1 = await borrower1()
		const ra = await insertRequest("CPE-0201", b1, "2026-11-20", "2026-11-22", "APPROVED")
		const rc = await insertRequest("CPE-0203", b1, "2026-11-10", "2026-11-12", "PENDING")
		const token = await custodian()

		expect((await approve(token, ra.id)).body.error.message).toBe("Only pending requests can be approved or rejected.")
		expect((await approve(token, rc.id)).body.error.message).toBe("This request's period has already ended.")
	})
})

describe("permissions (TEST-38, AC-33)", () => {
	it("a Borrower approving or rejecting their own request -> 403 x2, request unchanged", async () => {
		const ra = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const token = await loginAs(app.url, "BORROWER")

		const approved = await approve(token, ra.id)
		const rejected = await reject(token, ra.id, "Changed my mind")
		const blank = await reject(token, ra.id, "") // refused before the body is validated

		for (const res of [approved, rejected, blank]) {
			expect(res.status).toBe(403)
			expect(res.body.error.code).toBe("FORBIDDEN")
		}
		await expectUnchanged(ra.id)
	})

	it("an anonymous caller gets 401 on both, even with an invalid body", async () => {
		const ra = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")

		const approved = await api().post(`/api/requests/${ra.id}/approve`)
		const rejected = await api().post(`/api/requests/${ra.id}/reject`).send({ reason: "" })

		expect([approved.status, rejected.status]).toEqual([401, 401])
		await expectUnchanged(ra.id)
	})

	it.each([
		["not a UUID", "abc"],
		["unknown", "00000000-0000-4000-8000-000000000000"],
	])("404 NOT_FOUND when :id is %s", async (_, id) => {
		const token = await custodian()
		const approved = await approve(token, id)
		const rejected = await reject(token, id, "Exam week")
		for (const res of [approved, rejected]) {
			expect(res.status).toBe(404)
			expect(res.body.error.code).toBe("NOT_FOUND")
		}
	})
})

describe("concurrent approvals cannot double-book (TEST-39, AC-34, NFR-05)", () => {
	it("Promise.all([approve A, approve B]) on overlapping periods: one 200 and one 409, 10 times", async () => {
		const token = await custodian()
		const b1 = await borrower1()
		const b2 = await borrower2()

		for (let run = 0; run < 10; run++) {
			await prisma.borrowRequest.deleteMany()
			const a = await insertRequest("CPE-0201", b1, "2026-11-20", "2026-11-22", "PENDING")
			const b = await insertRequest("CPE-0201", b2, "2026-11-21", "2026-11-23", "PENDING")

			const responses = await Promise.all([approve(token, a.id), approve(token, b.id)])

			expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
			expect(responses.find((r) => r.status === 409)!.body.error.code).toBe("PERIOD_UNAVAILABLE")
			expect(await prisma.borrowRequest.count({ where: { status: "APPROVED" } })).toBe(1)
		}
	})
})
