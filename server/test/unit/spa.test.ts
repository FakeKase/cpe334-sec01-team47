import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Elysia } from "elysia"
import { afterAll, describe, expect, it, vi } from "vitest"

import { createApp } from "../../src/app"
import { spaRoutes } from "../../src/spa"

const INDEX = "<html>app</html>"
const base = mkdtempSync(join(tmpdir(), "spa-"))
const dist = join(base, "dist")
mkdirSync(join(dist, "assets"), { recursive: true })
writeFileSync(join(dist, "index.html"), INDEX)
writeFileSync(join(dist, "favicon.svg"), "<svg/>")
writeFileSync(join(dist, "assets", "app.js"), "console.log(1)")
writeFileSync(join(base, "secret.txt"), "secret")
afterAll(() => rmSync(base, { recursive: true, force: true }))

// The SPA routes never touch the DB, and /api/health does not either.
const withSpa = (dir: string) => new Elysia().use(createApp({ prisma: {} as never })).use(spaRoutes(dir))
const app = withSpa(dist)
const get = (path: string) => app.handle(new Request(`http://localhost${path}`))
const jsonNotFound = { error: { code: "NOT_FOUND", message: "Not found." } }

describe("spaRoutes", () => {
	it("serves index.html at / without caching it", async () => {
		const res = await get("/")
		expect(res.status).toBe(200)
		expect(res.headers.get("content-type")).toContain("text/html")
		expect(res.headers.get("cache-control")).toBe("no-cache")
		expect(await res.text()).toBe(INDEX)
	})

	it("serves a hashed asset with its own type and a long cache", async () => {
		const res = await get("/assets/app.js")
		expect(res.status).toBe(200)
		expect(res.headers.get("content-type")).toContain("javascript")
		expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
		expect(await res.text()).toBe("console.log(1)")
	})

	it("does not cache files outside /assets for long", async () => {
		const res = await get("/favicon.svg")
		expect(res.status).toBe(200)
		expect(res.headers.get("cache-control")).toBe("no-cache")
	})

	it("falls back to index.html for extensionless client routes and directories", async () => {
		for (const path of ["/requests", "/items/abc", "/assets"]) {
			const res = await get(path)
			expect(res.status).toBe(200)
			expect(res.headers.get("cache-control")).toBe("no-cache")
			expect(await res.text()).toBe(INDEX)
		}
	})

	it("404s a missing file with an extension instead of sending HTML", async () => {
		for (const path of ["/assets/index-OLDHASH.js", "/favicon.ico", "/assets/app.js.map"]) {
			const res = await get(path)
			expect(res.status).toBe(404)
			expect(await res.json()).toEqual(jsonNotFound)
		}
	})

	it("does not serve files outside the dist folder", async () => {
		for (const path of ["/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/%2e%2e/%2e%2e/secret.txt"]) {
			const res = await get(path)
			expect(res.status).toBe(404)
			expect(await res.text()).not.toContain("secret")
		}
	})

	it("never answers a NUL byte or a malformed escape with a 500", async () => {
		for (const path of ["/%00", "/assets/%00.js", "/%E0"]) {
			expect((await get(path)).status).toBeLessThan(500)
		}
	})

	it("keeps the API routes and the JSON 404 under /api, also when the slash is encoded", async () => {
		expect(await (await get("/api/health")).json()).toEqual({ status: "ok" })
		for (const path of ["/api/nope", "/api%2Fnope", "/api"]) {
			const res = await get(path)
			expect(res.status).toBe(404)
			expect(await res.json()).toEqual(jsonNotFound)
		}
	})

	it("warns and adds no routes when the client was not built", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const apiOnly = withSpa(join(base, "missing"))
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("No built client"))
		warn.mockRestore()
		const res = await apiOnly.handle(new Request("http://localhost/"))
		expect(res.status).toBe(404)
		expect(await res.json()).toEqual(jsonNotFound)
	})
})
