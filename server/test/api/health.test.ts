import request from "supertest"
import { afterAll, describe, expect, it } from "vitest"

import { createApp } from "../../src/app"
import { prisma } from "../helpers/db"

const app = createApp({ prisma })
afterAll(() => prisma.$disconnect())

describe("health", () => {
	it("GET /api/health is ok", async () => {
		const res = await request(app).get("/api/health")
		expect(res.status).toBe(200)
		expect(res.body).toEqual({ status: "ok" })
	})
	it("GET /api/ready queries the database", async () => {
		const res = await request(app).get("/api/ready")
		expect(res.status).toBe(200)
		expect(res.body).toEqual({ db: "connected" })
	})
})
