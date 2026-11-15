import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Elysia } from "elysia"
import { afterAll, describe, expect, it } from "vitest"

import { createApp } from "../../src/app"
import { spaRoutes } from "../../src/spa"

const base = mkdtempSync(join(tmpdir(), "spa-"))
const dist = join(base, "dist")
mkdirSync(join(dist, "assets"), { recursive: true })
writeFileSync(join(dist, "index.html"), "<html>app</html>")
writeFileSync(join(dist, "assets", "app.js"), "console.log(1)")
writeFileSync(join(base, "secret.txt"), "secret")
afterAll(() => rmSync(base, { recursive: true, force: true }))

// The SPA routes never touch the DB, and /api/health does not either.
const app = new Elysia().use(createApp({ prisma: {} as never })).use(spaRoutes(dist))
const get = (path: string) => app.handle(new Request(`http://localhost${path}`))

describe("spaRoutes", () => {
	it("serves index.html at /", async () => {
		const res = await get("/")
		expect(res.status).toBe(200)
		expect(res.headers.get("content-type")).toContain("text/html")
		expect(await res.text()).toBe("<html>app</html>")
	})

	it("serves a built asset", async () => {
		const res = await get("/assets/app.js")
		expect(res.status).toBe(200)
		expect(await res.text()).toBe("console.log(1)")
	})

	it("falls back to index.html for client routes and directories", async () => {
		expect(await (await get("/requests")).text()).toBe("<html>app</html>")
		expect(await (await get("/assets")).text()).toBe("<html>app</html>")
	})

	it("does not serve files outside the dist folder", async () => {
		for (const path of ["/%2e%2e/secret.txt", "/..%2fsecret.txt", "/%E0"]) {
			expect(await (await get(path)).text()).toBe("<html>app</html>")
		}
	})

	it("keeps the API routes and the JSON 404 under /api", async () => {
		expect(await (await get("/api/health")).json()).toEqual({ status: "ok" })
		const res = await get("/api/nope")
		expect(res.status).toBe(404)
		expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found." } })
	})
})
