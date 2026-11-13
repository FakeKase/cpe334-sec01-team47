import type { PrismaClient } from "@prisma/client"
import { Elysia } from "elysia"

import { type Clock, systemClock } from "./clock"
import { errorHandler } from "./middleware/errorHandler"
import { authRoutes } from "./routes/auth"
import { healthRoutes } from "./routes/health"
import { authService } from "./services/authService"

export type AppOptions = {
	prisma: PrismaClient
	clock?: Clock
	sessionTtlHours?: number
}

// No listen() here so tests can import the app (SDS §C1.4).
export function createApp({ prisma, clock = systemClock, sessionTtlHours = 8 }: AppOptions) {
	const auth = authService({ prisma, clock, sessionTtlHours })
	const app = new Elysia({ prefix: "/api" }).use(errorHandler).use(healthRoutes(prisma)).use(authRoutes(auth))

	// Forces an unexpected error so tests can check the 500 body (AC-08). Never mounted outside tests.
	if (process.env.NODE_ENV === "test") {
		app.get("/__test/boom", () => {
			throw new Error("db password=xyz")
		})
	}
	return app
}

/** Imported by the client for end-to-end types: `treaty<App>(url)` from @elysiajs/eden. */
export type App = ReturnType<typeof createApp>
