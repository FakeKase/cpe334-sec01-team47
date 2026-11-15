import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Elysia } from "elysia"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { errorHandler } from "../../src/middleware/errorHandler"
import { spaRoutes } from "../../src/spa"

const INDEX = "<!doctype html><html><body>app</body></html>"
let app: Elysia
let root: string

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "spa-"))
	const dir = join(root, "dist")
	mkdirSync(join(dir, "assets"), { recursive: true })
	writeFileSync(join(dir, "index.html"), INDEX)
	writeFileSync(join(dir, "assets", "app.js"), "console.log(1)")
	writeFileSync(join(root, "secret.txt"), "top secret") // next to dist, must stay unreachable
	app = new Elysia().use(errorHandler).use(spaRoutes(dir)) as unknown as Elysia
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const get = (path: string) => app.handle(new Request(`http://localhost${path}`))

describe("serving the built SPA", () => {
	it("GET / returns index.html", async () => {
		const res = await get("/")
		expect(res.status).toBe(200)
		expect(res.headers.get("content-type")).toContain("text/html")
		expect(await res.text()).toBe(INDEX)
	})

	it("serves an existing file with its own type", async () => {
		const res = await get("/assets/app.js")
		expect(res.status).toBe(200)
		expect(res.headers.get("content-type")).toContain("javascript")
		expect(await res.text()).toBe("console.log(1)")
	})

	it("falls back to index.html for a client route, so a refresh on /requests works", async () => {
		for (const path of ["/requests", "/items/abc", "/my-requests"]) {
			const res = await get(path)
			expect(res.status).toBe(200)
			expect(await res.text()).toBe(INDEX)
		}
	})

	it("404 for a missing file with an extension, never HTML posing as a script", async () => {
		const res = await get("/assets/missing.js")
		expect(res.status).toBe(404)
		expect(await res.text()).not.toContain("<html")
	})

	it("an unknown /api path is a JSON 404, not index.html", async () => {
		const res = await get("/api/nope")
		expect(res.status).toBe(404)
		expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found." } })
	})

	it("does not read files outside the client directory", async () => {
		for (const path of [
			"/../secret.txt",
			"/%2e%2e/secret.txt",
			"/assets/%2e%2e/%2e%2e/secret.txt",
			"/..%2fsecret.txt",
			"/%2e%2e%2fsecret.txt",
		]) {
			const res = await get(path)
			expect(await res.text()).not.toContain("top secret")
		}
	})
})
