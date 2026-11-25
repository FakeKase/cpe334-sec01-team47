import { ItemStatus } from "@prisma/client"
import { Elysia } from "elysia"
import { z } from "zod"

import { ASSET_TAG_MESSAGE, isAssetTag, normalizeAssetTag } from "../domain/assetTag"
import { requireAuth, requireRole } from "../middleware/auth"
import type { AuthService } from "../services/authService"
import type { CatalogService } from "../services/catalogService"
import type { InventoryService } from "../services/inventoryService"

/** Trimmed; "" and null clear the field, a missing key stays undefined so PATCH leaves it alone. */
const optionalText = (label: string, max: number) =>
	z
		.string()
		.trim()
		.max(max, `${label} can be at most ${max} characters.`)
		.nullish()
		.transform((v) => (v === undefined ? undefined : v || null))

// F-09 §2. Unknown keys such as status are stripped.
const itemBody = z.object({
	assetTag: z.string({ error: ASSET_TAG_MESSAGE }).transform(normalizeAssetTag).refine(isAssetTag, ASSET_TAG_MESSAGE),
	name: z
		.string({ error: "Name is required." })
		.trim()
		.min(1, "Name is required.")
		.max(100, "Name can be at most 100 characters."),
	categoryId: z.string({ error: "Choose a category." }).uuid("Choose a category."),
	location: optionalText("Location", 100),
	description: optionalText("Description", 1000),
})

export const catalogRoutes = (auth: AuthService, catalog: CatalogService, inventory: InventoryService) =>
	new Elysia()
		.get("/categories", () => catalog.listCategories())
		.use(requireAuth(auth))
		.get(
			"/items",
			({ query, user }) =>
				catalog.listItems(query.categoryId, query.includeRetired === "true" && user.role === "CUSTODIAN"),
			{
				query: z.object({
					categoryId: z.string().uuid().optional(),
					includeRetired: z.enum(["true", "false"]).optional(),
				}),
			}
		)
		.get("/items/:id", ({ params, user }) => catalog.getItem(params.id, user.role))
		.post(
			"/items",
			async ({ body, set }) => {
				set.status = 201
				return inventory.create(body)
			},
			{ body: itemBody, transform: requireRole("CUSTODIAN") }
		)
		.patch("/items/:id", ({ params, body }) => inventory.update(params.id, body), {
			body: itemBody.partial(),
			transform: requireRole("CUSTODIAN"),
		})
		.post("/items/:id/status", ({ params, body, user }) => inventory.setStatus(user.id, params.id, body.status), {
			body: z.object({ status: z.enum(ItemStatus) }),
			transform: requireRole("CUSTODIAN"),
		})
