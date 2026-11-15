import { PrismaClient } from "@prisma/client"

import { systemClock, today } from "../src/clock"
import { seed } from "./seedData"

const need = (name: string) => {
	const v = process.env[name]
	if (!v) throw new Error(`Missing environment variable: ${name}`) // name only, never the value
	return v
}

const demoData = process.env.SEED_DEMO_DATA === "true"
const prisma = new PrismaClient()
seed(prisma, {
	adminPassword: need("ADMIN_PASSWORD"),
	demoUserPassword: demoData ? need("DEMO_USER_PASSWORD") : undefined,
	demoRequests: process.env.SEED_DEMO_REQUESTS === "true",
	bcryptCost: Number(process.env.BCRYPT_COST ?? 12),
	today: today(systemClock, process.env.APP_TIMEZONE ?? "Asia/Bangkok"),
})
	.then(() => console.log("Seed complete"))
	.catch((e) => {
		console.error(e instanceof Error ? e.message : e)
		process.exitCode = 1
	})
	.finally(() => prisma.$disconnect())
