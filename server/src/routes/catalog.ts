import { Elysia } from "elysia"
import { z } from "zod"

import { requireAuth } from "../middleware/auth"
import type { AuthService } from "../services/authService"
import type { CatalogService } from "../services/catalogService"

export const catalogRoutes = (auth: AuthService, catalog: CatalogService) =>
	new Elysia()
		.get("/categories", () => catalog.listCategories())
		.use(requireAuth(auth))
		.get("/items", ({ query }) => catalog.listItems(query.categoryId), {
			query: z.object({ categoryId: z.string().uuid().optional() }),
		})
		.get("/items/:id", ({ params, user }) => catalog.getItem(params.id, user.role))
