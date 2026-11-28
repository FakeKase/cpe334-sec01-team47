import { Prisma, type PrismaClient } from "@prisma/client"

import { AppError, notFound } from "../errors"
import { isUuid } from "../uuid"

const DUPLICATE = "A category with this name already exists."
const duplicate = () => new AppError("DUPLICATE_CATEGORY_NAME", 409, DUPLICATE, [{ field: "name", message: DUPLICATE }])

const select = { id: true, name: true } as const

/** F-10. `name` is already trimmed and 1-60 characters. Names are unique ignoring letter case. */
export function categoryService(prisma: PrismaClient) {
	/**
	 * The unique index on lower("name") is the only duplicate check. A pre-check with Prisma's
	 * `mode: "insensitive"` would run as ILIKE and treat % and _ as wildcards (AC-79). The index also
	 * covers two calls that race, and lets a category be renamed to its own name in other letter case.
	 */
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
			return write(() => prisma.category.create({ data: { name }, select }))
		},

		/** Renaming a category to its own name, in any letter case, is allowed. */
		async rename(id: string, name: string) {
			if (!isUuid(id)) throw notFound()
			return write(() => prisma.category.update({ where: { id }, data: { name }, select }))
		},
	}
}

export type CategoryService = ReturnType<typeof categoryService>
