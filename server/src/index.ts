import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { PrismaClient } from "@prisma/client"
import { Elysia } from "elysia"

import { createApp } from "./app"
import { loadConfig } from "./config"
import { spaRoutes } from "./spa"

const config = loadConfig()
const prisma = new PrismaClient()
const app = new Elysia().use(
	createApp({ prisma, sessionTtlHours: config.SESSION_TTL_HOURS, timeZone: config.APP_TIMEZONE })
)

// The Docker image puts the built client at /app/client/dist; from a checkout it is client/dist (SDS §C1).
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url))
if (existsSync(join(clientDist, "index.html"))) app.use(spaRoutes(clientDist))
else console.warn(`No built client at ${clientDist}: serving the API only.`)

app.listen(config.PORT)
console.log(`API listening on :${config.PORT}`)

// Cloud Run sends SIGTERM: finish in-flight requests, then close the DB.
process.on("SIGTERM", async () => {
	await app.stop()
	await prisma.$disconnect()
})
