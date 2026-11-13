import { PrismaClient } from "@prisma/client"

import { seed } from "../../prisma/seedData"

export const prisma = new PrismaClient()

export const TEST_TODAY = "2026-11-15"
/** 12:00 on TEST_TODAY in Asia/Bangkok. */
export const TEST_NOW = new Date("2026-11-15T05:00:00Z")

export const fixtureOptions = {
	adminPassword: process.env.ADMIN_PASSWORD!,
	demoUserPassword: process.env.DEMO_USER_PASSWORD!,
	demoRequests: false,
	bcryptCost: 4,
	today: TEST_TODAY,
}

/** Empty every table and reload the deterministic fixture (call in beforeEach). */
export async function resetDb() {
	await prisma.$executeRaw`TRUNCATE "BorrowRequest", "Session", "Item", "Category", "User" RESTART IDENTITY CASCADE`
	await seed(prisma, fixtureOptions)
}
