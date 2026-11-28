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

/** CR-01: the reason written for a request that an approval rejected automatically. */
const AUTO_REASON = "Item booked by another request."

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
	// Revised by CR-01 (F-05 v0.3). v0.2 expected 409 PERIOD_UNAVAILABLE and B still PENDING.
	it("after A (20-22) is approved, B (21-23) has been rejected automatically, and approving B -> 409 INVALID_TRANSITION", async () => {
		const a = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const b = await pendingOn("CPE-0201", "2026-11-21", "2026-11-23", await borrower2())
		const token = await custodian()

		expect((await approve(token, a.id)).status).toBe(200)
		expect(await row(b.id)).toMatchObject({ status: "REJECTED", rejectionReason: AUTO_REASON })
		const res = await approve(token, b.id)

		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("INVALID_TRANSITION")
		expect(await row(b.id)).toMatchObject({ status: "REJECTED", rejectionReason: AUTO_REASON })
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
	// Revised by CR-01 (F-05 v0.3). v0.2: the 409 was PERIOD_UNAVAILABLE and the other request stayed PENDING.
	it("Promise.all([approve A, approve B]) on overlapping periods: one 200 and one 409 INVALID_TRANSITION, 10 times", async () => {
		const token = await custodian()
		const b1 = await borrower1()
		const b2 = await borrower2()

		for (let run = 0; run < 10; run++) {
			await prisma.borrowRequest.deleteMany()
			const a = await insertRequest("CPE-0201", b1, "2026-11-20", "2026-11-22", "PENDING")
			const b = await insertRequest("CPE-0201", b2, "2026-11-21", "2026-11-23", "PENDING")

			const responses = await Promise.all([approve(token, a.id), approve(token, b.id)])

			expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
			expect(responses.find((r) => r.status === 409)!.body.error.code).toBe("INVALID_TRANSITION")
			expect(await prisma.borrowRequest.count({ where: { status: "APPROVED" } })).toBe(1)
			const loser = (await row(a.id)).status === "APPROVED" ? b : a
			expect(await row(loser.id)).toMatchObject({ status: "REJECTED", rejectionReason: AUTO_REASON })
		}
	})
})

// ---------------------------------------------------------------------------------------------------------------
// CR-01 (F-05 v0.3): approving a request rejects the overlapping pending requests of the same item.

const custodianId = () => userId("custodian@example.test")

describe("approve rejects the overlapping pending requests (TEST-142, AC-121)", () => {
	it("A 20-22 approved: B, C and F rejected with the reason; D, E and the other item's G stay PENDING", async () => {
		const b1 = await borrower1()
		const b2 = await borrower2()
		const a = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22", b1)
		const b = await pendingOn("CPE-0201", "2026-11-21", "2026-11-23", b2)
		const c = await pendingOn("CPE-0201", "2026-11-22", "2026-11-24", b2)
		const d = await pendingOn("CPE-0201", "2026-11-23", "2026-11-25", b2)
		const e = await pendingOn("CPE-0201", "2026-11-18", "2026-11-19", b2)
		const f = await pendingOn("CPE-0201", "2026-11-19", "2026-11-20", b2)
		const g = await pendingOn("CPE-0202", "2026-11-21", "2026-11-23", b2)
		const token = await custodian()

		const res = await approve(token, a.id)

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ id: a.id, status: "APPROVED", autoRejectedCount: 3 })
		for (const id of [b.id, c.id, f.id]) {
			expect(await row(id)).toMatchObject({
				status: "REJECTED",
				rejectionReason: AUTO_REASON,
				decidedById: await custodianId(),
			})
			expect((await row(id)).decidedAt).not.toBeNull()
		}
		for (const id of [d.id, e.id, g.id]) await expectUnchanged(id)

		const list = await api().get("/api/requests").set(as(token))
		const status = (id: string) => list.body.find((r: { id: string }) => r.id === id).status
		expect([b.id, c.id, f.id].map(status)).toEqual(["REJECTED", "REJECTED", "REJECTED"])
		expect([d.id, e.id, g.id].map(status)).toEqual(["PENDING", "PENDING", "PENDING"])
	})
})

describe("the overlap boundaries (TEST-143, AC-122)", () => {
	it.each([
		{ name: "22-24 touches the last day", start: "2026-11-22", due: "2026-11-24", rejected: true },
		{ name: "19-20 touches the first day", start: "2026-11-19", due: "2026-11-20", rejected: true },
		{ name: "20-22 is the same period", start: "2026-11-20", due: "2026-11-22", rejected: true },
		{ name: "21-21 is inside", start: "2026-11-21", due: "2026-11-21", rejected: true },
		{ name: "23-25 starts the day after", start: "2026-11-23", due: "2026-11-25", rejected: false },
		{ name: "18-19 ends the day before", start: "2026-11-18", due: "2026-11-19", rejected: false },
	])("A is 20-22 and the other request is $name: rejected = $rejected", async ({ start, due, rejected }) => {
		const a = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const other = await pendingOn("CPE-0201", start, due, await borrower2())

		const res = await approve(await custodian(), a.id)

		expect(res.status).toBe(200)
		expect(res.body.autoRejectedCount).toBe(rejected ? 1 : 0)
		if (rejected) expect(await row(other.id)).toMatchObject({ status: "REJECTED", rejectionReason: AUTO_REASON })
		else await expectUnchanged(other.id)
	})
})

describe("a refused approval changes nothing else (TEST-144, AC-123)", () => {
	async function refusedWith(
		setup: () => Promise<{ a: { id: string }; b: { id: string } }>,
		token: Promise<string>,
		status: number,
		code?: string
	) {
		const { a, b } = await setup()
		const res = await approve(await token, a.id)
		expect(res.status).toBe(status)
		if (code) expect(res.body.error.code).toBe(code)
		await expectUnchanged(b.id)
	}
	const pair = async (aStart = "2026-11-20", aDue = "2026-11-22") => ({
		a: await pendingOn("CPE-0201", aStart, aDue),
		b: await pendingOn("CPE-0201", "2026-11-21", "2026-11-23", await borrower2()),
	})

	it("A already approved -> 409 INVALID_TRANSITION", () =>
		refusedWith(
			async () => {
				const p = await pair()
				await prisma.borrowRequest.update({ where: { id: p.a.id }, data: { status: "APPROVED" } })
				return p
			},
			custodian(),
			409,
			"INVALID_TRANSITION"
		))

	it("the item is under maintenance -> 409 ITEM_NOT_AVAILABLE", () =>
		refusedWith(
			async () => {
				const p = await pair()
				await prisma.item.update({ where: { assetTag: "CPE-0201" }, data: { status: "MAINTENANCE" } })
				return p
			},
			custodian(),
			409,
			"ITEM_NOT_AVAILABLE"
		))

	it("A's period has ended (due 10 Nov, today 15 Nov) -> 409 INVALID_TRANSITION", () =>
		refusedWith(
			async () => {
				const a = await pendingOn("CPE-0201", "2026-11-09", "2026-11-10")
				const b = await pendingOn("CPE-0201", "2026-11-10", "2026-11-12", await borrower2())
				return { a, b }
			},
			custodian(),
			409,
			"INVALID_TRANSITION"
		))

	it("an overdue CHECKED_OUT loan overlaps A -> 409 PERIOD_UNAVAILABLE", () =>
		refusedWith(
			async () => {
				await insertRequest("CPE-0201", await borrower2(), "2026-11-05", "2026-11-10", "CHECKED_OUT")
				return pair("2026-11-15", "2026-11-17")
			},
			custodian(),
			409,
			"PERIOD_UNAVAILABLE"
		))

	it("a Borrower calls approve -> 403", () => refusedWith(pair, loginAs(app.url, "BORROWER"), 403))
})

describe("what happens to the Borrower of a rejected request (TEST-145, AC-124)", () => {
	it("sees REJECTED with the reason, gets a free slot (BR-05), and the request cannot be approved any more", async () => {
		const b2 = await borrower2()
		const a = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const hit = await pendingOn("CPE-0201", "2026-11-21", "2026-11-23", b2)
		await pendingOn("CPE-0202", "2026-11-20", "2026-11-22", b2)
		await pendingOn("CPE-0203", "2026-11-20", "2026-11-22", b2) // three active requests, one of them in A's way
		const token = await custodian()
		const borrower2Token = await loginAs(app.url, "BORROWER2")
		const create = async () =>
			api()
				.post("/api/requests")
				.set(as(borrower2Token))
				.send({
					itemId: (await prisma.item.findUniqueOrThrow({ where: { assetTag: "CPE-0101" } })).id,
					startDate: "2026-11-20",
					dueDate: "2026-11-22",
					purpose: "Lab",
				})
		expect((await create()).body.error.code).toBe("ACTIVE_LIMIT_REACHED")

		expect((await approve(token, a.id)).status).toBe(200)

		const mine = await api().get("/api/requests").set(as(borrower2Token))
		expect(mine.body.find((r: { id: string }) => r.id === hit.id)).toMatchObject({
			status: "REJECTED",
			rejectionReason: AUTO_REASON,
			decidedBy: { displayName: "Custodian" },
		})
		expect((await create()).status).toBe(201)
		expect((await approve(token, hit.id)).body.error.code).toBe("INVALID_TRANSITION")
	})
})

describe("nothing else rejects other requests (TEST-146, AC-125)", () => {
	it("(a) no overlap: autoRejectedCount is 0", async () => {
		const a = await pendingOn("CPE-0201", "2026-11-20", "2026-11-22")
		const far = await pendingOn("CPE-0201", "2026-12-01", "2026-12-03", await borrower2())
		const res = await approve(await custodian(), a.id)
		expect(res.body.autoRejectedCount).toBe(0)
		await expectUnchanged(far.id)
	})

	it("(b) a manual reject leaves the overlapping pending request alone", async () => {
		const a = await pendingOn("CPE-0202", "2026-11-20", "2026-11-22")
		const b = await pendingOn("CPE-0202", "2026-11-21", "2026-11-23", await borrower2())
		expect((await reject(await custodian(), a.id, "Exam week")).status).toBe(200)
		await expectUnchanged(b.id)
	})

	it("(c) a checkout leaves an old overlapping pending request alone", async () => {
		const a = await insertRequest("CPE-0203", await borrower1(), "2026-11-15", "2026-11-20", "APPROVED")
		const b = await pendingOn("CPE-0203", "2026-11-16", "2026-11-18", await borrower2()) // from before the change
		const res = await api()
			.post(`/api/requests/${a.id}/checkout`)
			.set(as(await custodian()))
		expect(res.status).toBe(200)
		await expectUnchanged(b.id)
	})

	it("(d) cancelling the approved request does not reinstate the rejected one", async () => {
		const a = await pendingOn("CPE-0301", "2026-11-20", "2026-11-22")
		const b = await pendingOn("CPE-0301", "2026-11-21", "2026-11-23", await borrower2())
		expect((await approve(await custodian(), a.id)).status).toBe(200)
		const cancel = await api()
			.post(`/api/requests/${a.id}/cancel`)
			.set(as(await loginAs(app.url, "BORROWER")))
		expect(cancel.status).toBe(200)
		expect(await row(b.id)).toMatchObject({ status: "REJECTED", rejectionReason: AUTO_REASON })
	})
})
