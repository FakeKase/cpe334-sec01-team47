import { resolve, sep } from "node:path"

import { Elysia } from "elysia"

import { notFound } from "./errors"

/**
 * Serves the built client from the API process (the root Dockerfile / Cloud Run image).
 * Unknown paths get index.html so a refresh on a client route like /requests still works.
 * Docker Compose does not use this: nginx serves the client there.
 */
export function spaRoutes(distDir: string) {
	const root = resolve(distDir)
	const index = () => Bun.file(resolve(root, "index.html"))
	return new Elysia({ name: "spa" }).get("/*", async ({ path }) => {
		if (path === "/api" || path.startsWith("/api/")) throw notFound()
		let target: string
		try {
			target = resolve(root, `.${decodeURIComponent(path)}`)
		} catch {
			return index() // malformed escape such as /%E0
		}
		if (!target.startsWith(root + sep)) return index() // path traversal
		const file = Bun.file(target)
		return (await file.exists()) ? file : index()
	})
}
