import { type ItemStatus, Prisma, type PrismaClient } from "@prisma/client"

import type { Clock } from "../clock"
import { AppError, notFound } from "../errors"
import { isUuid } from "../uuid"
import type { CatalogService } from "./catalogService"

/** Already schema-valid: tag normalised, strings trimmed, empty optional text as null (F-09 §2). */
export type ItemInput = {
	assetTag: string
	name: string
	categoryId: string
	location?: string | null
	description?: string | null
}

const DUPLICATE = "This asset tag is already in use."
const retiredIsFinal = () => new AppError("INVALID_TRANSITION", 409, "Retired items cannot be changed.")

/** The unique index and the FK are the last line of defence: a lost race or a deleted category maps to a field error. */
async function mapWriteErrors<T>(write: () => Promise<T>): Promise<T> {
	try {
		return await write()
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
			throw new AppError("DUPLICATE_ASSET_TAG", 409, DUPLICATE, [{ field: "assetTag", message: DUPLICATE }])
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")
			throw new AppError("VALIDATION_ERROR", 400, "The request is invalid.", [
				{ field: "categoryId", message: "Choose a category." },
			])
		throw e
	}
}

export function inventoryService({
	prisma,
	clock,
	catalog,
}: {
	prisma: PrismaClient
	clock: Clock
	catalog: CatalogService
}) {
	const resource = (id: string) => catalog.getItem(id, "CUSTODIAN")

	return {
		/** FR-15. A new item is always ACTIVE. */
		async create(input: ItemInput) {
			const { id } = await mapWriteErrors(() =>
				prisma.item.create({ data: { ...input, status: "ACTIVE" }, select: { id: true } })
			)
			return resource(id)
		},

		/** FR-15. The status guard in the WHERE makes "not retired" and the write one statement. */
		async update(id: string, input: Partial<ItemInput>) {
			if (!isUuid(id)) throw notFound()
			const { count } = await mapWriteErrors(() =>
				prisma.item.updateMany({ where: { id, status: { not: "RETIRED" } }, data: input })
			)
			if (count === 0) {
				if (await prisma.item.findUnique({ where: { id }, select: { id: true } })) throw retiredIsFinal()
				throw notFound()
			}
			return resource(id)
		},

		/** FR-16, BR-11. Locks the item row like create-request and approve, so a retirement and an approval of the
		 * same item are serialised (NFR-05). */
		async setStatus(custodianId: string, id: string, status: ItemStatus) {
			if (!isUuid(id)) throw notFound()
			await prisma.$transaction(async (tx) => {
				const [item] = await tx.$queryRaw<{ status: ItemStatus }[]>`
					SELECT status FROM "Item" WHERE id = ${id}::uuid FOR UPDATE`
				if (!item) throw notFound()
				if (item.status === "RETIRED") throw retiredIsFinal()
				if (item.status === status) return

				if (status === "RETIRED") {
					const inUse = await tx.borrowRequest.count({
						where: { itemId: id, status: { in: ["APPROVED", "CHECKED_OUT"] } },
					})
					if (inUse > 0)
						throw new AppError(
							"ITEM_IN_USE",
							409,
							"This item has approved or checked-out loans, so it cannot be retired."
						)
					await tx.borrowRequest.updateMany({
						where: { itemId: id, status: "PENDING" },
						data: {
							status: "REJECTED",
							rejectionReason: "Item retired",
							decidedById: custodianId,
							decidedAt: clock(),
						},
					})
				}
				await tx.item.update({ where: { id }, data: { status } })
			})
			return resource(id)
		},
	}
}

export type InventoryService = ReturnType<typeof inventoryService>
