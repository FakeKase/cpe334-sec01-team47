import type { RequestStatus } from "@prisma/client"
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

const itemId = async (assetTag: string) => (await prisma.item.findUniqueOrThrow({ where: { assetTag } })).id
const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id
const borrower1 = () => userId("borrower1@example.test")
const borrower2 = () => userId("borrower2@example.test")
const count = () => prisma.borrowRequest.count()

/** Inserts a request directly, bypassing the API (fixture). Dates are inclusive YYYY-MM-DD. */
async function insertRequest(
	assetTag: string,
	borrowerId: string,
	startDate: string,
	dueDate: string,
	status: RequestStatus,
	extra: { createdAt?: Date; rejectionReason?: string } = {}
) {
	return prisma.borrowRequest.create({
		data: {
			itemId: await itemId(assetTag),
			borrowerId,
			startDate: new Date(startDate),
			dueDate: new Date(dueDate),
			purpose: "fixture",
			status,
			...extra,
		},
	})
}

type Body = Record<string, unknown>
const post = (token: string, body: Body) => api().post("/api/requests").set(as(token)).send(body)
const valid = async (assetTag = "CPE-0201", startDate = "2026-11-20", dueDate = "2026-11-22") => ({
	itemId: await itemId(assetTag),
	startDate,
	dueDate,
	purpose: "Signals lab experiment 4",
})
const fields = (res: { body: { error: { details?: { field: string }[] } } }) =>
	(res.body.error.details ?? []).map((d) => d.field)

describe("POST /api/requests creates a PENDING request owned by the caller (TEST-17, AC-15)", () => {
	it("ignores borrowerId and status in the body and persists the row", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const b1 = await borrower1()
		const body = {
			...(await valid()),
			purpose: "  Signals lab experiment 4  ",
			borrowerId: await borrower2(),
			status: "APPROVED",
		}

		const res = await post(token, body)

		expect(res.status).toBe(201)
		expect(Object.keys(res.body).sort()).toEqual(
			[
				"borrower",
				"createdAt",
				"decidedAt",
				"decidedBy",
				"dueDate",
				"id",
				"item",
				"purpose",
				"rejectionReason",
				"startDate",
				"status",
			].sort()
		)
		expect(res.body).toMatchObject({
			status: "PENDING",
			item: { id: body.itemId, assetTag: "CPE-0201", name: "Rigol DS1054Z oscilloscope" },
			borrower: { id: b1, displayName: "Borrower One" },
			startDate: "2026-11-20",
			dueDate: "2026-11-22",
			purpose: "Signals lab experiment 4",
			rejectionReason: null,
			decidedBy: null,
			decidedAt: null,
		})
		expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt)

		const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: res.body.id } })
		expect(row).toMatchObject({ borrowerId: b1, status: "PENDING", purpose: "Signals lab experiment 4" })
		expect(row.startDate.toISOString().slice(0, 10)).toBe("2026-11-20")
		expect(row.dueDate.toISOString().slice(0, 10)).toBe("2026-11-22")
	})
})

describe("BR-01 loan period (TEST-19, AC-16)", () => {
	it("400 startDate for a start before today, 400 dueDate for a 15-day period, nothing stored", async () => {
		const token = await loginAs(app.url, "BORROWER")

		const past = await post(token, await valid("CPE-0201", "2026-11-14", "2026-11-16"))
		expect(past.status).toBe(400)
		expect(past.body.error.code).toBe("VALIDATION_ERROR")
		expect(past.body.error.details).toContainEqual({ field: "startDate", message: "Start date cannot be in the past." })

		const long = await post(token, await valid("CPE-0201", "2026-11-15", "2026-11-29"))
		expect(long.status).toBe(400)
		expect(long.body.error.code).toBe("VALIDATION_ERROR")
		expect(long.body.error.details).toContainEqual({ field: "dueDate", message: "A loan can be at most 14 days." })

		const backwards = await post(token, await valid("CPE-0201", "2026-11-20", "2026-11-19"))
		expect(backwards.status).toBe(400)
		expect(fields(backwards)).toEqual(["dueDate"])

		expect(await count()).toBe(0)
	})

	it("accepts start = today and a 14-day period", async () => {
		const token = await loginAs(app.url, "BORROWER")
		expect((await post(token, await valid("CPE-0201", "2026-11-15", "2026-11-28"))).status).toBe(201)
	})
})

describe("malformed bodies (contract §2 case 1)", () => {
	it.each([
		["itemId missing", { itemId: undefined }, "itemId"],
		["itemId not a UUID", { itemId: "abc" }, "itemId"],
		["startDate missing", { startDate: undefined }, "startDate"],
		["startDate not YYYY-MM-DD", { startDate: "20/11/2026" }, "startDate"],
		["dueDate not a real date", { dueDate: "2026-11-31" }, "dueDate"],
		["purpose missing", { purpose: undefined }, "purpose"],
	])("%s -> 400 VALIDATION_ERROR with that field", async (_, patch, field) => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await post(token, { ...(await valid()), ...patch })
		expect(res.status).toBe(400)
		expect(res.body.error.code).toBe("VALIDATION_ERROR")
		expect(fields(res)).toContain(field)
		expect(await count()).toBe(0)
	})
})

describe("purpose (TEST-20, AC-17)", () => {
	it.each([
		["empty", ""],
		["whitespace only", "   "],
		["301 characters", "a".repeat(301)],
	])("%s -> 400 purpose", async (_, purpose) => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await post(token, { ...(await valid()), purpose })
		expect(res.status).toBe(400)
		expect(res.body.error.code).toBe("VALIDATION_ERROR")
		expect(fields(res)).toContain("purpose")
		expect(await count()).toBe(0)
	})

	it("300 characters -> 201", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await post(token, { ...(await valid()), purpose: "a".repeat(300) })
		expect(res.status).toBe(201)
	})

	it("the limit applies after trimming (contract v0.1.1)", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await post(token, { ...(await valid()), purpose: `  ${"a".repeat(300)}  ` })
		expect(res.status).toBe(201)
		expect(res.body.purpose).toHaveLength(300)
	})
})

describe("BR-02 item status (TEST-21, AC-18)", () => {
	it("409 ITEM_NOT_AVAILABLE for MAINTENANCE, 404 for RETIRED and unknown, nothing stored", async () => {
		const token = await loginAs(app.url, "BORROWER")

		const maintenance = await post(token, await valid("CPE-0901"))
		expect(maintenance.status).toBe(409)
		expect(maintenance.body.error).toEqual({
			code: "ITEM_NOT_AVAILABLE",
			message: "This item is under maintenance and cannot be requested.",
		})

		const retired = await post(token, await valid("CPE-0999"))
		expect(retired.status).toBe(404)
		expect(retired.body.error.code).toBe("NOT_FOUND")

		const unknown = await post(token, { ...(await valid()), itemId: crypto.randomUUID() })
		expect(unknown.status).toBe(404)
		expect(unknown.body.error.code).toBe("NOT_FOUND")

		expect(await count()).toBe(0)
	})
})

describe("BR-03 no double booking (TEST-23, AC-19)", () => {
	it("blocks an overlap with an APPROVED period, allows the day after, allows overlap with another borrower's PENDING", async () => {
		const b2 = await borrower2()
		await insertRequest("CPE-0202", b2, "2026-11-20", "2026-11-22", "APPROVED") // item X
		await insertRequest("CPE-0203", b2, "2026-11-20", "2026-11-22", "PENDING") // item Y
		const token = await loginAs(app.url, "BORROWER")

		const overlap = await post(token, await valid("CPE-0202", "2026-11-22", "2026-11-24"))
		expect(overlap.status).toBe(409)
		expect(overlap.body.error).toEqual({
			code: "PERIOD_UNAVAILABLE",
			message: "This item is already booked for part of that period.",
		})

		expect((await post(token, await valid("CPE-0202", "2026-11-23", "2026-11-25"))).status).toBe(201)
		expect((await post(token, await valid("CPE-0203", "2026-11-21", "2026-11-21"))).status).toBe(201)
	})

	it("a CHECKED_OUT period blocks too", async () => {
		await insertRequest("CPE-0202", await borrower2(), "2026-11-15", "2026-11-18", "CHECKED_OUT")
		const token = await loginAs(app.url, "BORROWER")
		const res = await post(token, await valid("CPE-0202", "2026-11-18", "2026-11-19"))
		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("PERIOD_UNAVAILABLE")
	})

	it.each(["REJECTED", "CANCELLED", "RETURNED"] as const)("a %s period never blocks", async (status) => {
		await insertRequest("CPE-0202", await borrower2(), "2026-11-20", "2026-11-22", status)
		const token = await loginAs(app.url, "BORROWER")
		expect((await post(token, await valid("CPE-0202", "2026-11-20", "2026-11-22"))).status).toBe(201)
	})
})

describe("BR-04 no duplicate request (TEST-24, AC-20)", () => {
	it("blocks an overlap with the caller's own PENDING request on the same item only", async () => {
		await insertRequest("CPE-0202", await borrower1(), "2026-11-20", "2026-11-22", "PENDING")
		const token = await loginAs(app.url, "BORROWER")

		const dup = await post(token, await valid("CPE-0202", "2026-11-21", "2026-11-23"))
		expect(dup.status).toBe(409)
		expect(dup.body.error).toEqual({
			code: "DUPLICATE_REQUEST",
			message: "You already have a request for this item in that period.",
		})

		expect((await post(token, await valid("CPE-0203", "2026-11-21", "2026-11-23"))).status).toBe(201)
	})

	it("BR-03 is checked before BR-04 when the caller's own request is APPROVED", async () => {
		await insertRequest("CPE-0202", await borrower1(), "2026-11-20", "2026-11-22", "APPROVED")
		const token = await loginAs(app.url, "BORROWER")
		const res = await post(token, await valid("CPE-0202", "2026-11-21", "2026-11-23"))
		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("PERIOD_UNAVAILABLE")
	})
})

describe("BR-05 active request limit (TEST-25, AC-21)", () => {
	const active = async (borrowerId: string) =>
		prisma.borrowRequest.count({ where: { borrowerId, status: { in: ["PENDING", "APPROVED", "CHECKED_OUT"] } } })

	it("blocks a 4th active request and allows one again after a rejection", async () => {
		const b1 = await borrower1()
		const [first] = await Promise.all(
			["CPE-0001", "CPE-0002", "CPE-0003"].map((tag) => insertRequest(tag, b1, "2026-11-20", "2026-11-22", "PENDING"))
		)
		const token = await loginAs(app.url, "BORROWER")

		const fourth = await post(token, await valid("CPE-0201"))
		expect(fourth.status).toBe(409)
		expect(fourth.body.error).toEqual({
			code: "ACTIVE_LIMIT_REACHED",
			message: "You can have at most 3 active requests.",
		})
		expect(await active(b1)).toBe(3)

		await prisma.borrowRequest.update({ where: { id: first!.id }, data: { status: "REJECTED" } })
		expect((await post(token, await valid("CPE-0201"))).status).toBe(201)
		expect(await active(b1)).toBe(3)
	})

	it("concurrent submissions cannot exceed the limit (borrower row lock)", async () => {
		const b1 = await borrower1()
		const token = await loginAs(app.url, "BORROWER")
		const tags = ["CPE-0001", "CPE-0002", "CPE-0003", "CPE-0101", "CPE-0102"]
		tags.push("CPE-0201", "CPE-0202", "CPE-0203", "CPE-0301", "CPE-0302")
		const bodies = await Promise.all(tags.map((tag) => valid(tag))) // build first so the POSTs start together

		const results = await Promise.all(bodies.map(async (body) => (await post(token, body)).status))

		expect(results.filter((s) => s === 201)).toHaveLength(3)
		expect(results.filter((s) => s === 409)).toHaveLength(7)
		expect(await active(b1)).toBe(3)
	})
})

describe("permissions (TEST-26, AC-22)", () => {
	it("a Custodian gets 403 FORBIDDEN and nothing is stored", async () => {
		const token = await loginAs(app.url, "CUSTODIAN")
		const res = await post(token, await valid())
		expect(res.status).toBe(403)
		expect(res.body.error.code).toBe("FORBIDDEN")
		expect(await count()).toBe(0)
	})

	it("an anonymous caller gets 401, even with an invalid body", async () => {
		const res = await api().post("/api/requests").send({ purpose: "" })
		expect(res.status).toBe(401)
		expect(res.body.error.code).toBe("UNAUTHENTICATED")
		expect(await count()).toBe(0)
	})
})

describe("GET /api/requests lists only the Borrower's own requests, newest first (TEST-28, AC-24)", () => {
	const ids = (res: { body: { id: string }[] }) => res.body.map((r) => r.id)

	async function fixture() {
		const b1 = await borrower1()
		const r1 = await insertRequest("CPE-0201", b1, "2026-11-20", "2026-11-22", "PENDING", {
			createdAt: new Date("2026-11-10T03:00:00Z"),
		})
		const r2 = await insertRequest("CPE-0202", b1, "2026-11-20", "2026-11-22", "REJECTED", {
			createdAt: new Date("2026-11-11T03:00:00Z"),
			rejectionReason: "Exam week",
		})
		const r3 = await insertRequest("CPE-0203", await borrower2(), "2026-11-20", "2026-11-22", "PENDING", {
			createdAt: new Date("2026-11-12T03:00:00Z"),
		})
		return { r1, r2, r3 }
	}

	it("returns [R2, R1] with R2's rejectionReason; R3 never appears", async () => {
		const { r1, r2 } = await fixture()
		const token = await loginAs(app.url, "BORROWER")

		const res = await api().get("/api/requests").set(as(token))

		expect(res.status).toBe(200)
		expect(ids(res)).toEqual([r2.id, r1.id])
		expect(res.body[0]).toMatchObject({
			status: "REJECTED",
			rejectionReason: "Exam week",
			item: { assetTag: "CPE-0202" },
			borrower: { displayName: "Borrower One" },
			startDate: "2026-11-20",
			dueDate: "2026-11-22",
		})
	})

	it("?status=PENDING returns only the Borrower's pending request", async () => {
		const { r1 } = await fixture()
		const token = await loginAs(app.url, "BORROWER")

		const res = await api().get("/api/requests?status=PENDING").set(as(token))

		expect(res.status).toBe(200)
		expect(ids(res)).toEqual([r1.id])
	})

	it("ignores ?borrowerId=<Borrower 2>", async () => {
		const { r1, r2 } = await fixture()
		const token = await loginAs(app.url, "BORROWER")

		const res = await api()
			.get(`/api/requests?borrowerId=${await borrower2()}`)
			.set(as(token))

		expect(res.status).toBe(200)
		expect(ids(res)).toEqual([r2.id, r1.id])
	})

	it("returns [] for a Borrower with no requests", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await api().get("/api/requests").set(as(token))
		expect(res.status).toBe(200)
		expect(res.body).toEqual([])
	})

	it("400 VALIDATION_ERROR for a status outside the six values", async () => {
		const token = await loginAs(app.url, "BORROWER")
		const res = await api().get("/api/requests?status=OVERDUE").set(as(token))
		expect(res.status).toBe(400)
		expect(res.body.error.code).toBe("VALIDATION_ERROR")
	})

	it("401 without a token", async () => {
		const res = await api().get("/api/requests")
		expect(res.status).toBe(401)
		expect(res.body.error.code).toBe("UNAUTHENTICATED")
	})

	it("a Custodian sees every request, and ?status=PENDING is oldest first (F-05 scope)", async () => {
		const { r1, r2, r3 } = await fixture()
		const token = await loginAs(app.url, "CUSTODIAN")

		const all = await api().get("/api/requests").set(as(token))
		expect(all.status).toBe(200)
		expect(ids(all)).toEqual([r3.id, r2.id, r1.id])

		const pending = await api().get("/api/requests?status=PENDING").set(as(token))
		expect(pending.status).toBe(200)
		expect(ids(pending)).toEqual([r1.id, r3.id])
		expect(pending.body[1].borrower.displayName).toBe("Borrower Two")
	})
})

describe("GET /api/requests/:id is ownership-scoped (TEST-29, AC-25)", () => {
	const r3 = async () => insertRequest("CPE-0203", await borrower2(), "2026-11-20", "2026-11-22", "PENDING")

	it("404 with body keys exactly [error] for another Borrower's request; 200 for its owner", async () => {
		const { id } = await r3()

		const other = await api()
			.get(`/api/requests/${id}`)
			.set(as(await loginAs(app.url, "BORROWER")))
		expect(other.status).toBe(404)
		expect(Object.keys(other.body)).toEqual(["error"])
		expect(other.body.error.code).toBe("NOT_FOUND")

		const owner = await api()
			.get(`/api/requests/${id}`)
			.set(as(await loginAs(app.url, "BORROWER2")))
		expect(owner.status).toBe(200)
		expect(owner.body).toMatchObject({ id, status: "PENDING", borrower: { displayName: "Borrower Two" } })
	})

	it("a Custodian can read any request", async () => {
		const { id } = await r3()
		const res = await api()
			.get(`/api/requests/${id}`)
			.set(as(await loginAs(app.url, "CUSTODIAN")))
		expect(res.status).toBe(200)
		expect(res.body.id).toBe(id)
	})

	it.each([
		["not a UUID", "abc"],
		["unknown", "00000000-0000-4000-8000-000000000000"],
	])("404 NOT_FOUND when :id is %s", async (_, id) => {
		const res = await api()
			.get(`/api/requests/${id}`)
			.set(as(await loginAs(app.url, "BORROWER")))
		expect(res.status).toBe(404)
		expect(res.body.error.code).toBe("NOT_FOUND")
	})

	it("401 without a token", async () => {
		const { id } = await r3()
		const res = await api().get(`/api/requests/${id}`)
		expect(res.status).toBe(401)
	})
})
