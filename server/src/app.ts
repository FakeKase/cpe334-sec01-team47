import type { PrismaClient } from "@prisma/client"
import express from "express"

import { healthRouter } from "./routes/health"

// No listen() here so tests can import the app (SDS §C1.4).
export function createApp({ prisma }: { prisma: PrismaClient }) {
	const app = express()
	app.use(express.json({ limit: "100kb" }))
	app.use("/api", healthRouter(prisma))
	return app
}
