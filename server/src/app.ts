import type { PrismaClient } from "@prisma/client"
import { Elysia } from "elysia"

import { type Clock, systemClock } from "./clock"
import { errorHandler } from "./middleware/errorHandler"
import { authRoutes } from "./routes/auth"
import { catalogRoutes } from "./routes/catalog"
import { healthRoutes } from "./routes/health"
import { requestRoutes } from "./routes/requests"
import { authService } from "./services/authService"
import { catalogService } from "./services/catalogService"
import { requestService } from "./services/requestService"

export type AppOptions = {
	prisma: PrismaClient
	clock?: Clock
	sessionTtlHours?: number
	timeZone?: string
}

// No listen() here so tests can import the app (SDS §C1.4).
export function createApp({ prisma, clock = systemClock, sessionTtlHours = 8, timeZone = "Asia/Bangkok" }: AppOptions) {
	const auth = authService({ prisma, clock, sessionTtlHours })
	const catalog = catalogService({ prisma, clock, timeZone })
	const requests = requestService({ prisma, clock, timeZone })
	const app = new Elysia({ prefix: "/api" })
		.use(errorHandler)
		.use(healthRoutes(prisma))
		.use(authRoutes(auth))
		.use(catalogRoutes(auth, catalog))
		.use(requestRoutes(auth, requests))

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
