import { join } from "node:path"

import { PrismaClient } from "@prisma/client"
import { Elysia } from "elysia"

import { createApp } from "./app"
import { loadConfig } from "./config"
import { spaRoutes } from "./spa"

const config = loadConfig()
const prisma = new PrismaClient()
// The root Dockerfile copies the built client here. In dev Vite serves it, so the folder is missing.
const clientDist = join(import.meta.dir, "../../client/dist")
const app = new Elysia().use(
	createApp({
		prisma,
		sessionTtlHours: config.SESSION_TTL_HOURS,
		timeZone: config.APP_TIMEZONE,
	})
)
if (await Bun.file(join(clientDist, "index.html")).exists()) app.use(spaRoutes(clientDist))
app.listen(config.PORT)
console.log(`API listening on :${config.PORT}`)

// Cloud Run sends SIGTERM: finish in-flight requests, then close the DB.
process.on("SIGTERM", async () => {
	await app.stop()
	await prisma.$disconnect()
})
