import { PrismaClient, type RequestStatus } from "@prisma/client"

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

export const itemId = async (assetTag: string) => (await prisma.item.findUniqueOrThrow({ where: { assetTag } })).id
export const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id
export const borrower1 = () => userId("borrower1@example.test")
export const borrower2 = () => userId("borrower2@example.test")

/** Inserts a request directly, bypassing the API (fixture). Dates are inclusive YYYY-MM-DD. */
export async function insertRequest(
	assetTag: string,
	borrowerId: string,
	startDate: string,
	dueDate: string,
	status: RequestStatus,
	extra: { id?: string; createdAt?: Date; rejectionReason?: string } = {}
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
