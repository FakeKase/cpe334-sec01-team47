import type { PrismaClient } from "@prisma/client"
import { Elysia } from "elysia"
import { z } from "zod"

export const healthRoutes = (prisma: PrismaClient) =>
	new Elysia({ name: "health" })
		.get("/health", () => ({ status: "ok" as const }), {
			response: z.object({ status: z.literal("ok") }),
		})
		.get(
			"/ready",
			async ({ status }) => {
				try {
					await prisma.$queryRaw`SELECT 1`
					return { db: "connected" as const }
				} catch {
					return status(503, { db: "unavailable" as const })
				}
			},
			{
				response: {
					200: z.object({ db: z.literal("connected") }),
					503: z.object({ db: z.literal("unavailable") }),
				},
			}
		)
