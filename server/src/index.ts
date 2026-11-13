import { PrismaClient } from "@prisma/client"

import { createApp } from "./app"
import { loadConfig } from "./config"

const config = loadConfig()
const prisma = new PrismaClient()
const app = createApp({ prisma }).listen(config.PORT)
console.log(`API listening on :${config.PORT}`)

// Cloud Run sends SIGTERM: finish in-flight requests, then close the DB.
process.on("SIGTERM", async () => {
	await app.stop()
	await prisma.$disconnect()
})
