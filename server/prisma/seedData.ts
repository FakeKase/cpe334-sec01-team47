import type { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

import { addDays } from "../src/clock"

export type SeedOptions = {
	adminPassword: string
	/** When set, the two demo Borrowers are created (SEED_DEMO_DATA=true). */
	demoUserPassword?: string
	/** Adds the APPROVED demo booking on CPE-0201 (needs the demo Borrowers). */
	demoRequests: boolean
	bcryptCost: number
	/** YYYY-MM-DD in APP_TIMEZONE. */
	today: string
}

const CATEGORIES = ["Microcontrollers", "Single-board computers", "Measurement instruments", "Audio-visual"]

const ITEMS: [tag: string, name: string, category: string, status?: "MAINTENANCE" | "RETIRED"][] = [
	["CPE-0001", "Arduino Uno R3", CATEGORIES[0]],
	["CPE-0002", "Arduino Uno R3", CATEGORIES[0]],
	["CPE-0003", "ESP32 DevKit", CATEGORIES[0]],
	["CPE-0101", "Raspberry Pi 5 kit", CATEGORIES[1]],
	["CPE-0102", "Raspberry Pi 4 kit", CATEGORIES[1]],
	["CPE-0201", "Rigol DS1054Z oscilloscope", CATEGORIES[2]],
	["CPE-0202", "Fluke 117 multimeter", CATEGORIES[2]],
	["CPE-0203", "Bench power supply", CATEGORIES[2]],
	["CPE-0301", "Epson portable projector", CATEGORIES[3]],
	["CPE-0302", "Wireless microphone set", CATEGORIES[3]],
	["CPE-0901", "Logic analyzer", CATEGORIES[2], "MAINTENANCE"], // demonstrates BR-02
	["CPE-0999", "Old CRT oscilloscope", CATEGORIES[2], "RETIRED"], // demonstrates BR-02
]

/** Idempotent: upserts by email, category name and asset tag (SDS §C2.4). */
export async function seed(prisma: PrismaClient, o: SeedOptions) {
	if (o.demoRequests && !o.demoUserPassword) throw new Error("Demo requests need the demo users.")

	for (const name of CATEGORIES) {
		await prisma.category.upsert({ where: { name }, update: {}, create: { name } })
	}
	for (const [assetTag, name, categoryName, status] of ITEMS) {
		const category = await prisma.category.findUniqueOrThrow({ where: { name: categoryName } })
		await prisma.item.upsert({
			where: { assetTag },
			update: {},
			create: { assetTag, name, categoryId: category.id, status },
		})
	}

	const user = (email: string, displayName: string, role: "BORROWER" | "CUSTODIAN", password: string) =>
		prisma.user.upsert({
			where: { email },
			update: {},
			create: { email, displayName, role, passwordHash: bcrypt.hashSync(password, o.bcryptCost) },
		})
	const custodian = await user("custodian@example.test", "Custodian", "CUSTODIAN", o.adminPassword)
	if (!o.demoUserPassword) return
	const borrower1 = await user("borrower1@example.test", "Borrower One", "BORROWER", o.demoUserPassword)
	await user("borrower2@example.test", "Borrower Two", "BORROWER", o.demoUserPassword)

	if (!o.demoRequests) return
	const item = await prisma.item.findUniqueOrThrow({ where: { assetTag: "CPE-0201" } })
	const booked = await prisma.borrowRequest.count({
		where: { itemId: item.id, status: { in: ["APPROVED", "CHECKED_OUT"] } },
	})
	if (booked === 0) {
		await prisma.borrowRequest.create({
			data: {
				itemId: item.id,
				borrowerId: borrower1.id,
				startDate: new Date(addDays(o.today, 7)),
				dueDate: new Date(addDays(o.today, 9)),
				purpose: "Demo booking",
				status: "APPROVED",
				decidedById: custodian.id,
				decidedAt: new Date(),
			},
		})
	}
}
