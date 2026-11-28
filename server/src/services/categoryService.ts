import { Prisma, type PrismaClient } from "@prisma/client"

import { AppError, notFound } from "../errors"
import { isUuid } from "../uuid"

const DUPLICATE = "A category with this name already exists."
const duplicate = () => new AppError("DUPLICATE_CATEGORY_NAME", 409, DUPLICATE, [{ field: "name", message: DUPLICATE }])

const select = { id: true, name: true } as const

/** F-10. `name` is already trimmed and 1-60 characters. Names are unique ignoring letter case. */
export function categoryService(prisma: PrismaClient) {
	/** Another category (not `exceptId`) already has this name, in any letter case. */
	const taken = async (name: string, exceptId?: string) =>
		(await prisma.category.count({
			where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
		})) > 0

	/** The unique indexes are the last line of defence: when two calls race, the loser gets the same 409. */
	async function write<T>(run: () => Promise<T>): Promise<T> {
		try {
			return await run()
		} catch (e) {
			if (e instanceof Prisma.PrismaClientKnownRequestError) {
				if (e.code === "P2002") throw duplicate()
				if (e.code === "P2025") throw notFound()
			}
			throw e
		}
	}

	return {
		async create(name: string) {
			if (await taken(name)) throw duplicate()
			return write(() => prisma.category.create({ data: { name }, select }))
		},

		/** Renaming a category to its own name, in any letter case, is allowed. */
		async rename(id: string, name: string) {
			if (!isUuid(id)) throw notFound()
			if (await taken(name, id)) throw duplicate()
			return write(() => prisma.category.update({ where: { id }, data: { name }, select }))
		},
	}
}

export type CategoryService = ReturnType<typeof categoryService>
