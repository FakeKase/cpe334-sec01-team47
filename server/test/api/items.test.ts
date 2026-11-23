import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loginAs, startTestApp } from "../helpers/app"
import { borrower1, borrower2, insertRequest, itemId, prisma, resetDb, userId } from "../helpers/db"

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
const borrower = () => loginAs(app.url, "BORROWER")
const create = (token: string, body: object) => api().post("/api/items").set(as(token)).send(body)
const patch = (token: string, id: string, body: object) => api().patch(`/api/items/${id}`).set(as(token)).send(body)
const setStatus = (token: string, id: string, status: unknown) =>
	api().post(`/api/items/${id}/status`).set(as(token)).send({ status })
const approve = (token: string, id: string) => api().post(`/api/requests/${id}/approve`).set(as(token))
const fields = (res: { body: { error: { details?: { field: string }[] } } }) =>
	(res.body.error.details ?? []).map((d) => d.field)
const measurement = async () =>
	(await prisma.category.findUniqueOrThrow({ where: { name: "Measurement instruments" } })).id
const item = (assetTag: string) => prisma.item.findUniqueOrThrow({ where: { assetTag } })
const requestRow = (id: string) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } })

const RESOURCE_KEYS = [
	"assetTag",
	"availableToday",
	"category",
	"committedPeriods",
	"description",
	"id",
	"location",
	"name",
	"status",
]

async function validBody(overrides: object = {}) {
	return {
		assetTag: "CPE-0500",
		name: "Soldering station",
		categoryId: await measurement(),
		location: "Cabinet A1",
		description: "Hakko FX-888D",
		...overrides,
	}
}

describe("POST /api/items creates an ACTIVE item (TEST-51, AC-43)", () => {
	it("201 with the upper-cased tag; status in the body is ignored; the list shows it", async () => {
		const token = await custodian()
		const res = await create(token, await validBody({ assetTag: "cpe-0500", status: "RETIRED" }))

		expect(res.status).toBe(201)
		expect(Object.keys(res.body).sort()).toEqual(RESOURCE_KEYS)
		expect(res.body).toMatchObject({
			assetTag: "CPE-0500",
			name: "Soldering station",
			location: "Cabinet A1",
			description: "Hakko FX-888D",
			status: "ACTIVE",
			availableToday: true,
			category: { id: await measurement(), name: "Measurement instruments" },
			committedPeriods: [],
		})
		expect(await item("CPE-0500")).toMatchObject({
			id: res.body.id,
			name: "Soldering station",
			status: "ACTIVE",
			categoryId: await measurement(),
		})

		const list = await api().get("/api/items").set(as(token))
		expect(list.body.map((i: { assetTag: string }) => i.assetTag)).toContain("CPE-0500")
	})
})

describe("BR-12 asset tag format and uniqueness (TEST-53, AC-44)", () => {
	it("400 for a bad format, 201 at the boundaries, 409 for a tag already used in another case", async () => {
		const token = await custodian()
		const before = await prisma.item.count()

		for (const assetTag of ["CPE0042", "AB-12"]) {
			const res = await create(token, await validBody({ assetTag }))
			expect(res.status).toBe(400)
			expect(res.body.error.code).toBe("VALIDATION_ERROR")
			expect(fields(res)).toEqual(["assetTag"])
		}
		for (const assetTag of ["AB-123", "ABCDE-12345"]) {
			expect((await create(token, await validBody({ assetTag }))).status).toBe(201)
		}

		const dup = await create(token, await validBody({ assetTag: "cpe-0201" }))
		expect(dup.status).toBe(409)
		expect(dup.body.error.code).toBe("DUPLICATE_ASSET_TAG")
		expect(dup.body.error.details[0].field).toBe("assetTag")

		expect(await prisma.item.count()).toBe(before + 2)
	})
})

describe("other field rules (TEST-54, AC-45)", () => {
	const cases: [label: string, overrides: object, field: string][] = [
		["no name", { name: undefined }, "name"],
		["blank name", { name: "   " }, "name"],
		["101-char name", { name: "a".repeat(101) }, "name"],
		["no categoryId", { categoryId: undefined }, "categoryId"],
		["unknown category", { categoryId: "00000000-0000-4000-8000-000000000000" }, "categoryId"],
		["101-char location", { location: "a".repeat(101) }, "location"],
		["1001-char description", { description: "a".repeat(1001) }, "description"],
	]

	it.each(cases)("%s -> 400 on that field, no row", async (_label, overrides, field) => {
		const token = await custodian()
		const before = await prisma.item.count()
		const res = await create(token, await validBody(overrides))
		expect(res.status).toBe(400)
		expect(res.body.error.code).toBe("VALIDATION_ERROR")
		expect(fields(res)).toContain(field)
		expect(await prisma.item.count()).toBe(before)
	})
})

describe("PATCH /api/items/:id (TEST-55, AC-46)", () => {
	it("updates only the fields sent and clears an empty description", async () => {
		const token = await custodian()
		const original = await item("CPE-0202")
		await prisma.item.update({ where: { id: original.id }, data: { description: "old" } })

		const res = await patch(token, original.id, { name: "Fluke 117 (new)", location: "Shelf 3", description: "" })

		expect(res.status).toBe(200)
		expect(res.body).toMatchObject({ name: "Fluke 117 (new)", location: "Shelf 3", description: null })
		expect(await item("CPE-0202")).toMatchObject({
			name: "Fluke 117 (new)",
			location: "Shelf 3",
			description: null,
			categoryId: original.categoryId,
			status: "ACTIVE",
		})
	})

	it("409 for another item's tag, 200 for its own tag in lower case", async () => {
		const token = await custodian()
		const id = await itemId("CPE-0202")

		const dup = await patch(token, id, { assetTag: "CPE-0201" })
		expect(dup.status).toBe(409)
		expect(dup.body.error.code).toBe("DUPLICATE_ASSET_TAG")
		expect((await item("CPE-0202")).id).toBe(id)

		const own = await patch(token, id, { assetTag: "cpe-0202" })
		expect(own.status).toBe(200)
		expect(own.body.assetTag).toBe("CPE-0202")
	})

	it("409 INVALID_TRANSITION for a retired item, unchanged", async () => {
		const token = await custodian()
		const res = await patch(token, await itemId("CPE-0999"), { name: "Revived" })
		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("INVALID_TRANSITION")
		expect((await item("CPE-0999")).name).toBe("Old CRT oscilloscope")
	})
})

describe("ACTIVE <-> MAINTENANCE (TEST-56, AC-47)", () => {
	it("maintenance blocks new requests and approvals, keeps the approved loan, and is reversible", async () => {
		const token = await custodian()
		const id = await itemId("CPE-0201")
		const approved = await insertRequest("CPE-0201", await borrower2(), "2026-11-20", "2026-11-22", "APPROVED")
		const pending = await insertRequest("CPE-0201", await borrower1(), "2026-11-25", "2026-11-26", "PENDING")

		const toMaintenance = await setStatus(token, id, "MAINTENANCE")
		expect(toMaintenance.status).toBe(200)
		expect(toMaintenance.body.status).toBe("MAINTENANCE")

		const blocked = await approve(token, pending.id)
		expect(blocked.status).toBe(409)
		expect(blocked.body.error.code).toBe("ITEM_NOT_AVAILABLE")

		const newRequest = await api()
			.post("/api/requests")
			.set(as(await borrower()))
			.send({ itemId: id, startDate: "2026-11-28", dueDate: "2026-11-29", purpose: "lab" })
		expect(newRequest.status).toBe(409)
		expect(newRequest.body.error.code).toBe("ITEM_NOT_AVAILABLE")

		const again = await setStatus(token, id, "MAINTENANCE")
		expect(again.status).toBe(200)
		expect((await item("CPE-0201")).status).toBe("MAINTENANCE")

		expect((await setStatus(token, id, "ACTIVE")).status).toBe(200)
		expect((await approve(token, pending.id)).status).toBe(200)
		expect((await requestRow(approved.id)).status).toBe("APPROVED")
	})
})

describe("BR-11 safe retirement (TEST-57, AC-48)", () => {
	it.each(["APPROVED", "CHECKED_OUT"] as const)(
		"409 ITEM_IN_USE with a %s request, nothing changes",
		async (status) => {
			const token = await custodian()
			const busy = await insertRequest("CPE-0201", await borrower2(), "2026-11-20", "2026-11-22", status)
			const pending = await insertRequest("CPE-0201", await borrower1(), "2026-11-25", "2026-11-26", "PENDING")

			const res = await setStatus(token, await itemId("CPE-0201"), "RETIRED")

			expect(res.status).toBe(409)
			expect(res.body.error.code).toBe("ITEM_IN_USE")
			expect((await item("CPE-0201")).status).toBe("ACTIVE")
			expect((await requestRow(busy.id)).status).toBe(status)
			expect(await requestRow(pending.id)).toMatchObject({
				status: "PENDING",
				rejectionReason: null,
				decidedById: null,
			})
		}
	)

	it("retires and rejects only the PENDING requests with 'Item retired'", async () => {
		const token = await custodian()
		const custodianId = await userId("custodian@example.test")
		const pending = await insertRequest("CPE-0203", await borrower1(), "2026-11-25", "2026-11-26", "PENDING")
		const rejected = await insertRequest("CPE-0203", await borrower2(), "2026-11-20", "2026-11-21", "REJECTED", {
			rejectionReason: "Exam week",
		})
		const returned = await insertRequest("CPE-0203", await borrower2(), "2026-11-01", "2026-11-03", "RETURNED")

		const res = await setStatus(token, await itemId("CPE-0203"), "RETIRED")

		expect(res.status).toBe(200)
		expect(res.body.status).toBe("RETIRED")
		expect(res.body.availableToday).toBe(false)
		expect((await item("CPE-0203")).status).toBe("RETIRED")
		const p = await requestRow(pending.id)
		expect(p).toMatchObject({ status: "REJECTED", rejectionReason: "Item retired", decidedById: custodianId })
		expect(p.decidedAt).toBeInstanceOf(Date)
		expect(await requestRow(rejected.id)).toMatchObject({
			status: "REJECTED",
			rejectionReason: "Exam week",
			decidedById: null,
		})
		expect(await requestRow(returned.id)).toMatchObject({ status: "RETURNED", decidedById: null })
	})

	it.each(["ACTIVE", "MAINTENANCE", "RETIRED"])("a retired item cannot change to %s", async (status) => {
		const token = await custodian()
		const res = await setStatus(token, await itemId("CPE-0999"), status)
		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("INVALID_TRANSITION")
		expect((await item("CPE-0999")).status).toBe("RETIRED")
	})
})

describe("retire and approve race (TEST-58, AC-49)", () => {
	it("exactly one wins and the final state is consistent", async () => {
		const token = await custodian()
		const r = await insertRequest("CPE-0203", await borrower1(), "2026-11-20", "2026-11-22", "PENDING")

		const [retire, approval] = await Promise.all([
			setStatus(token, await itemId("CPE-0203"), "RETIRED"),
			approve(token, r.id),
		])

		expect([retire.status, approval.status].filter((s) => s === 200)).toHaveLength(1)
		const finalItem = (await item("CPE-0203")).status
		const finalRequest = (await requestRow(r.id)).status
		expect([
			["RETIRED", "REJECTED"],
			["ACTIVE", "APPROVED"],
		]).toContainEqual([finalItem, finalRequest])
	})
})

describe("permissions and ids (TEST-59, AC-50)", () => {
	it("a Borrower gets 403 for create, edit and status, and nothing changes", async () => {
		const token = await borrower()
		const id = await itemId("CPE-0202")
		const before = await prisma.item.count()

		for (const res of [
			await create(token, await validBody()),
			await patch(token, id, { name: "Hacked" }),
			await setStatus(token, id, "RETIRED"),
		]) {
			expect(res.status).toBe(403)
			expect(res.body.error.code).toBe("FORBIDDEN")
		}
		expect(await prisma.item.count()).toBe(before)
		expect(await item("CPE-0202")).toMatchObject({ name: "Fluke 117 multimeter", status: "ACTIVE" })
	})

	it("no token gives 401 on all three", async () => {
		const id = await itemId("CPE-0202")
		for (const res of [
			await api()
				.post("/api/items")
				.send(await validBody()),
			await api().patch(`/api/items/${id}`).send({ name: "x" }),
			await api().post(`/api/items/${id}/status`).send({ status: "RETIRED" }),
		]) {
			expect(res.status).toBe(401)
			expect(res.body.error.code).toBe("UNAUTHENTICATED")
		}
	})

	it("404 for an unknown or malformed id, 400 for an unknown status", async () => {
		const token = await custodian()
		for (const id of [crypto.randomUUID(), "abc"]) {
			expect((await patch(token, id, { name: "x" })).status).toBe(404)
			expect((await setStatus(token, id, "MAINTENANCE")).status).toBe(404)
		}
		const bad = await setStatus(token, await itemId("CPE-0202"), "BROKEN")
		expect(bad.status).toBe(400)
		expect(fields(bad)).toContain("status")
	})
})

describe("custodians can read retired items (TEST-60, AC-51)", () => {
	const tags = (res: { body: { assetTag: string }[] }) => res.body.map((i) => i.assetTag)

	it("includeRetired lists CPE-0999 for a Custodian only", async () => {
		const c = await custodian()
		const b = await borrower()

		const all = await api().get("/api/items?includeRetired=true").set(as(c))
		expect(all.status).toBe(200)
		expect(all.body).toHaveLength(12)
		expect(all.body.find((i: { assetTag: string }) => i.assetTag === "CPE-0999")).toMatchObject({
			status: "RETIRED",
			availableToday: false,
		})

		const borrowerList = await api().get("/api/items?includeRetired=true").set(as(b))
		expect(borrowerList.body).toHaveLength(11)
		expect(tags(borrowerList)).not.toContain("CPE-0999")

		const plain = await api().get("/api/items").set(as(c))
		expect(plain.body).toHaveLength(11)
	})

	it("detail of a retired item: 200 for a Custodian, 404 for a Borrower", async () => {
		const id = await itemId("CPE-0999")
		const c = await api()
			.get(`/api/items/${id}`)
			.set(as(await custodian()))
		expect(c.status).toBe(200)
		expect(c.body).toMatchObject({ assetTag: "CPE-0999", status: "RETIRED", availableToday: false })

		const b = await api()
			.get(`/api/items/${id}`)
			.set(as(await borrower()))
		expect(b.status).toBe(404)
	})
})
