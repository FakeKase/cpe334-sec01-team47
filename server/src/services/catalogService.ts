import type { PrismaClient, Role } from "@prisma/client"

import { type Clock, today } from "../clock"
import { notFound } from "../errors"
import { isUuid } from "../uuid"

const OCCUPYING = ["APPROVED", "CHECKED_OUT"] as const
const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function catalogService({ prisma, clock, timeZone }: { prisma: PrismaClient; clock: Clock; timeZone: string }) {
	// @db.Date columns come back as UTC midnight, so compare against UTC midnight of today.
	const todayDate = () => new Date(today(clock, timeZone))
	const bookedToday = () => ({
		where: { status: { in: [...OCCUPYING] }, startDate: { lte: todayDate() }, dueDate: { gte: todayDate() } },
		select: { id: true },
		take: 1,
	})

	return {
		listCategories: () => prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),

		/** `includeRetired` is only passed for Custodians (F-09 §1). */
		async listItems(categoryId?: string, includeRetired = false) {
			const items = await prisma.item.findMany({
				where: { ...(!includeRetired && { status: { not: "RETIRED" as const } }), ...(categoryId && { categoryId }) },
				orderBy: [{ name: "asc" }, { assetTag: "asc" }],
				select: {
					id: true,
					assetTag: true,
					name: true,
					status: true,
					category: { select: { id: true, name: true } },
					requests: bookedToday(),
				},
			})
			return items.map(({ requests, ...item }) => ({
				...item,
				availableToday: item.status === "ACTIVE" && requests.length === 0,
			}))
		},

		async getItem(id: string, role: Role) {
			const item = isUuid(id)
				? await prisma.item.findUnique({
						where: { id },
						select: {
							id: true,
							assetTag: true,
							name: true,
							description: true,
							location: true,
							status: true,
							category: { select: { id: true, name: true } },
							requests: {
								where: { status: { in: [...OCCUPYING] }, dueDate: { gte: todayDate() } },
								orderBy: { startDate: "asc" },
								select: {
									startDate: true,
									dueDate: true,
									status: true,
									borrower: { select: { displayName: true } },
								},
							},
						},
					})
				: null
			// A Custodian can open a retired item to manage it (F-02 v0.2); for a Borrower it does not exist.
			if (!item || (item.status === "RETIRED" && role !== "CUSTODIAN")) throw notFound()

			const { requests, ...rest } = item
			const t = todayDate()
			return {
				...rest,
				availableToday: item.status === "ACTIVE" && !requests.some((r) => r.startDate <= t && r.dueDate >= t),
				committedPeriods: requests.map((r) => ({
					startDate: ymd(r.startDate),
					dueDate: ymd(r.dueDate),
					status: r.status,
					...(role === "CUSTODIAN" && { borrower: { displayName: r.borrower.displayName } }),
				})),
			}
		},
	}
}

export type CatalogService = ReturnType<typeof catalogService>
