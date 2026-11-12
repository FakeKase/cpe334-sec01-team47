import type { PrismaClient } from "@prisma/client"
import { Router } from "express"

export function healthRouter(prisma: PrismaClient) {
	const router = Router()
	router.get("/health", (_req, res) => {
		res.json({ status: "ok" })
	})
	router.get("/ready", async (_req, res) => {
		try {
			await prisma.$queryRaw`SELECT 1`
			res.json({ db: "connected" })
		} catch {
			res.status(503).json({ db: "unavailable" })
		}
	})
	return router
}
