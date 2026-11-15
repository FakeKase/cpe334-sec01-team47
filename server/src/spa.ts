import { statSync } from "node:fs"
import { extname, join, resolve, sep } from "node:path"

import { Elysia } from "elysia"

import { notFound } from "./errors"

// Vite names everything in /assets by content hash, so those files never change.
const IMMUTABLE = "public, max-age=31536000, immutable"

// statSync also throws on a NUL byte, so /%00 lands here instead of a 500.
const isFile = (path: string) => {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}

/**
 * Serves the built client from the API process (the root Dockerfile / Cloud Run image).
 * An extensionless path that matches no file gets index.html, so a refresh on /requests works.
 * A missing file with an extension is a 404, so a stale page never gets HTML in place of a script.
 * Docker Compose does not use this: nginx serves the client there and the server image has no dist.
 */
export function spaRoutes(distDir: string) {
	const root = resolve(distDir)
	const index = join(root, "index.html")
	const spa = new Elysia({ name: "spa" })
	if (!isFile(index)) {
		console.warn(`No built client at ${root}: serving the API only.`)
		return spa
	}
	const send = (file: string, cache: string) => new Response(Bun.file(file), { headers: { "cache-control": cache } })
	return spa.get("/*", ({ path: raw }) => {
		let path: string
		try {
			path = decodeURIComponent(raw)
		} catch {
			throw notFound() // malformed escape such as /%E0
		}
		// After decoding, so /api%2Fnope is still the JSON 404.
		if (path === "/api" || path.startsWith("/api/")) throw notFound()
		const file = resolve(root, `.${path}`)
		if (file.startsWith(root + sep) && isFile(file)) {
			return send(file, path.startsWith("/assets/") ? IMMUTABLE : "no-cache")
		}
		if (extname(path)) throw notFound()
		return send(index, "no-cache")
	})
}
