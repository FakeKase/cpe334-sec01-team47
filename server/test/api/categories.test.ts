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

const custodianToken = () => loginAs(app.url, "CUSTODIAN")
const borrowerToken = () => loginAs(app.url, "BORROWER")
const create = (token: string, body: object) => api().post("/api/categories").set(as(token)).send(body)
const rename = (token: string, id: string, body: object) =>
	api().patch(`/api/categories/${id}`).set(as(token)).send(body)
const byName = (name: string) => prisma.category.findUniqueOrThrow({ where: { name } })
const names = async () => (await prisma.category.findMany({ orderBy: { name: "asc" } })).map((c) => c.name)
const fieldsOf = (res: request.Response) => res.body.error.details.map((d: { field: string }) => d.field)

describe("POST /api/categories (TEST-94, AC-77)", () => {
	it("201 with the trimmed name; the row exists and the public list shows it in name order", async () => {
		const res = await create(await custodianToken(), { name: "  Test equipment  " })

		expect(res.status).toBe(201)
		expect(res.body).toEqual({ id: expect.any(String), name: "Test equipment" })
		expect(await prisma.category.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({
			name: "Test equipment",
		})

		const list = await api().get("/api/categories") // no token: the list is public
		expect(list.status).toBe(200)
		const listed = list.body.map((c: { name: string }) => c.name)
		expect(listed).toHaveLength(5)
		expect(listed).toContain("Test equipment")
		expect(listed).toEqual([...listed].sort((a: string, b: string) => a.localeCompare(b)))
	})
})

describe("PATCH /api/categories/:id (TEST-95, AC-78)", () => {
	it("renames in place: same id, the items show the new name and no item row changes", async () => {
		const measurement = await byName("Measurement instruments")
		const itemsBefore = await prisma.item.findMany({
			where: { categoryId: measurement.id },
			orderBy: { assetTag: "asc" },
		})
		const token = await custodianToken()

		const res = await rename(token, measurement.id, { name: "Lab instruments" })

		expect(res.status).toBe(200)
		expect(res.body).toEqual({ id: measurement.id, name: "Lab instruments" })
		expect(await names()).toContain("Lab instruments")
		expect(await names()).not.toContain("Measurement instruments")

		const list = await api().get("/api/items").set(as(token))
		const mine = list.body.filter((i: { category: { id: string } }) => i.category.id === measurement.id)
		expect(mine.length).toBeGreaterThan(0)
		for (const item of mine) expect(item.category.name).toBe("Lab instruments")
		const detail = await api().get(`/api/items/${mine[0].id}`).set(as(token))
		expect(detail.body.category).toEqual({ id: measurement.id, name: "Lab instruments" })

		const itemsAfter = await prisma.item.findMany({
			where: { categoryId: measurement.id },
			orderBy: { assetTag: "asc" },
		})
		expect(itemsAfter).toEqual(itemsBefore)
	})

	it("renaming a category to its own name, or to its name in other letter case, is 200", async () => {
		const c = await byName("Audio-visual")
		const token = await custodianToken()

		expect((await rename(token, c.id, { name: "Audio-visual" })).status).toBe(200)
		const recased = await rename(token, c.id, { name: "AUDIO-VISUAL" })
		expect(recased.status).toBe(200)
		expect(recased.body.name).toBe("AUDIO-VISUAL")
		expect((await rename(token, c.id, { name: "AUDIO-VISUAL" })).status).toBe(200)
	})
})

describe("duplicate names (TEST-96, TEST-97, AC-79)", () => {
	it.each(["audio-visual", " AUDIO-VISUAL ", "Audio-visual"])(
		"creating %j -> 409 DUPLICATE_CATEGORY_NAME, nothing changes",
		async (name) => {
			const before = await names()

			const res = await create(await custodianToken(), { name })

			expect(res.status).toBe(409)
			expect(res.body.error.code).toBe("DUPLICATE_CATEGORY_NAME")
			expect(res.body.error.message).toBe("A category with this name already exists.")
			expect(fieldsOf(res)).toEqual(["name"])
			expect(await names()).toEqual(before)
		}
	)

	it("renaming a category to another one's name in other letter case -> 409 and it keeps its name", async () => {
		const c = await byName("Microcontrollers")
		const before = await names()

		const res = await rename(await custodianToken(), c.id, { name: "AUDIO-visual" })

		expect(res.status).toBe(409)
		expect(res.body.error.code).toBe("DUPLICATE_CATEGORY_NAME")
		expect(fieldsOf(res)).toEqual(["name"])
		expect(await names()).toEqual(before)
	})

	it("two creates of the same name at the same moment: one 201, one 409, one row", async () => {
		const token = await custodianToken()

		const results = await Promise.all([create(token, { name: "Cables" }), create(token, { name: "cables" })])

		expect(results.map((r) => r.status).sort()).toEqual([201, 409])
		expect(results.find((r) => r.status === 409)!.body.error.code).toBe("DUPLICATE_CATEGORY_NAME")
		expect(await prisma.category.count({ where: { name: { equals: "cables", mode: "insensitive" } } })).toBe(1)
	})
})

describe("name validation (TEST-98, AC-80)", () => {
	it.each([[{}], [{ name: "" }], [{ name: "   " }], [{ name: "a".repeat(61) }]])(
		"create with %j -> 400 naming `name`, no row",
		async (body) => {
			const before = await names()
			const res = await create(await custodianToken(), body)
			expect(res.status).toBe(400)
			expect(res.body.error.code).toBe("VALIDATION_ERROR")
			expect(fieldsOf(res)).toContain("name")
			expect(await names()).toEqual(before)
		}
	)

	it("a 60-character name is accepted on create and on rename; an empty rename is 400 and changes nothing", async () => {
		const token = await custodianToken()
		const created = await create(token, { name: "a".repeat(60) })
		expect(created.status).toBe(201)

		const c = await byName("Audio-visual")
		const bad = await rename(token, c.id, { name: "" })
		expect(bad.status).toBe(400)
		expect(fieldsOf(bad)).toContain("name")
		expect((await prisma.category.findUniqueOrThrow({ where: { id: c.id } })).name).toBe("Audio-visual")

		expect((await rename(token, c.id, { name: "b".repeat(60) })).status).toBe(200)
	})
})

describe("who may change categories (TEST-99, AC-81)", () => {
	it("403 for a Borrower (even with an invalid body), 401 without a token, 404 for an unknown id; nothing changes", async () => {
		const c = await byName("Audio-visual")
		const before = await names()
		const borrower = await borrowerToken()
		const custodian = await custodianToken()

		expect((await create(borrower, { name: "Cables" })).status).toBe(403)
		expect((await create(borrower, {})).status).toBe(403)
		expect((await rename(borrower, c.id, { name: "Cables" })).status).toBe(403)
		expect((await rename(borrower, c.id, {})).status).toBe(403)

		expect((await api().post("/api/categories").send({ name: "Cables" })).status).toBe(401)
		expect((await api().patch(`/api/categories/${c.id}`).send({ name: "Cables" })).status).toBe(401)

		for (const id of ["00000000-0000-4000-8000-000000000000", "abc"]) {
			const res = await rename(custodian, id, { name: "Cables" })
			expect(res.status).toBe(404)
			expect(res.body.error.code).toBe("NOT_FOUND")
		}

		expect(await names()).toEqual(before)
		expect((await api().get("/api/categories")).status).toBe(200)
	})
})
