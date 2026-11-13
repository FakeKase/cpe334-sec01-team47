import type { PrismaClient } from "@prisma/client"
import { Elysia } from "elysia"

import { healthRoutes } from "./routes/health"

// No listen() here so tests can import the app (SDS §C1.4).
export function createApp({ prisma }: { prisma: PrismaClient }) {
	return new Elysia({ prefix: "/api" }).use(healthRoutes(prisma))
}

/** Imported by the client for end-to-end types: `treaty<App>(url)` from @elysiajs/eden. */
export type App = ReturnType<typeof createApp>
