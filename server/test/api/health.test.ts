import { treaty } from "@elysiajs/eden"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { type App, createApp } from "../../src/app"
import { prisma } from "../helpers/db"

const app = createApp({ prisma })
let url: string

beforeAll(() => {
	url = app.listen(0).server!.url.origin
})
afterAll(async () => {
	await app.stop()
	await prisma.$disconnect()
})

describe("health", () => {
	it("GET /api/health is ok", async () => {
		const res = await request(url).get("/api/health")
		expect(res.status).toBe(200)
		expect(res.body).toEqual({ status: "ok" })
	})
	it("GET /api/ready queries the database", async () => {
		const res = await request(url).get("/api/ready")
		expect(res.status).toBe(200)
		expect(res.body).toEqual({ db: "connected" })
	})
	it("GET /api/ready is 503 when the database is down", async () => {
		const down = createApp({ prisma: { $queryRaw: () => Promise.reject(new Error("down")) } as never })
		const res = await request(down.listen(0).server!.url.origin).get("/api/ready")
		await down.stop()
		expect(res.status).toBe(503)
		expect(res.body).toEqual({ db: "unavailable" })
	})
	it("is typed end to end through Eden", async () => {
		const api = treaty<App>(url)
		const { data } = await api.api.health.get()
		expect(data?.status).toBe("ok")
	})
})
