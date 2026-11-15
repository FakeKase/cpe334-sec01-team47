import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { seed } from "../../prisma/seedData"
import { fixtureOptions, prisma, resetDb } from "../helpers/db"

const counts = async () => ({
	categories: await prisma.category.count(),
	items: await prisma.item.count(),
	users: await prisma.user.count(),
	requests: await prisma.borrowRequest.count(),
})

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

describe("seed", () => {
	it("creates the documented data", async () => {
		expect(await counts()).toEqual({ categories: 4, items: 12, users: 3, requests: 0 })
		const special = await prisma.item.findMany({ where: { status: { not: "ACTIVE" } }, orderBy: { assetTag: "asc" } })
		expect(special.map((i) => [i.assetTag, i.status])).toEqual([
			["CPE-0901", "MAINTENANCE"],
			["CPE-0999", "RETIRED"],
		])
	})

	it("is idempotent: a second run changes no row counts", async () => {
		const before = await counts()
		await seed(prisma, fixtureOptions)
		expect(await counts()).toEqual(before)
	})

	it("stores hashed passwords only (NFR-03)", async () => {
		const user = await prisma.user.findUniqueOrThrow({ where: { email: "custodian@example.test" } })
		expect(user.passwordHash).not.toBe(fixtureOptions.adminPassword)
		expect(user.passwordHash.startsWith("$2")).toBe(true)
	})

	it("creates no Borrowers without SEED_DEMO_DATA", async () => {
		await prisma.$executeRaw`TRUNCATE "User" CASCADE`
		await seed(prisma, { ...fixtureOptions, demoUserPassword: undefined })
		expect(await prisma.user.count({ where: { role: "BORROWER" } })).toBe(0)
		expect(await prisma.user.count({ where: { role: "CUSTODIAN" } })).toBe(1)
	})

	it("demo booking is today+7..today+9 and is not duplicated on rerun", async () => {
		const demo = { ...fixtureOptions, demoRequests: true }
		await seed(prisma, demo)
		await seed(prisma, demo)
		const rows = await prisma.borrowRequest.findMany()
		expect(rows).toHaveLength(1)
		expect([rows[0].startDate, rows[0].dueDate].map((d) => d.toISOString().slice(0, 10))).toEqual([
			"2026-11-22",
			"2026-11-24",
		])
	})

	it("database rejects dueDate before startDate (BR-01 last line of defence)", async () => {
		const item = await prisma.item.findFirstOrThrow()
		const borrower = await prisma.user.findFirstOrThrow({ where: { role: "BORROWER" } })
		await expect(
			prisma.borrowRequest.create({
				data: {
					itemId: item.id,
					borrowerId: borrower.id,
					startDate: new Date("2026-11-20"),
					dueDate: new Date("2026-11-19"),
					purpose: "x",
				},
			})
		).rejects.toThrow()
	})
})
