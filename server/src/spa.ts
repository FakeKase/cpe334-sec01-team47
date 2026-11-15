import { statSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"

import { Elysia } from "elysia"

import { notFound } from "./errors"

const isFile = (path: string) => {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}

/**
 * Serves the built React app from `dir`. A GET outside `/api` that matches no file returns index.html, so a refresh
 * on a client route like /requests works. A missing file with an extension is a 404, never HTML posing as a script.
 * Mounted from index.ts, not createApp, so tests do not need a built client.
 */
export const spaRoutes = (dir: string) => {
	const root = resolve(dir)
	const index = join(root, "index.html")
	const send = (file: string, cache: string) => new Response(Bun.file(file), { headers: { "cache-control": cache } })

	const handler = ({ request }: { request: Request }) => {
		let path: string
		try {
			path = decodeURIComponent(new URL(request.url).pathname)
		} catch {
			throw notFound()
		}
		// Unknown API routes keep the JSON 404 from errorHandler instead of falling through to the SPA.
		if (path === "/api" || path.startsWith("/api/")) throw notFound()

		const file = resolve(root, `.${path}`)
		if (file !== root && !file.startsWith(root + sep)) throw notFound()
		if (isFile(file)) {
			// Vite names everything in /assets by content hash, so it can be cached for good.
			return send(file, path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache")
		}
		if (extname(path)) throw notFound()
		return send(index, "no-cache")
	}

	return new Elysia({ name: "spa" }).get("/", handler).get("/*", handler)
}
