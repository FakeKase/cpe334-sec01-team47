import type { PrismaClient, Role } from "@prisma/client"

import { type Clock, today } from "../clock"
import { effectiveEnd, isOverdue } from "../domain/overdue"
import { notFound } from "../errors"
import { isUuid } from "../uuid"

const OCCUPYING = ["APPROVED", "CHECKED_OUT"] as const
const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function catalogService({ prisma, clock, timeZone }: { prisma: PrismaClient; clock: Clock; timeZone: string }) {
	// @db.Date columns come back as UTC midnight, so compare against UTC midnight of today.
	const todayDate = () => new Date(today(clock, timeZone))
	// A CHECKED_OUT loan holds the item until it is returned, even past its due date (BR-03, F-08).
	const stillBooked = () => ({
		status: { in: [...OCCUPYING] },
		OR: [{ status: "CHECKED_OUT" as const }, { dueDate: { gte: todayDate() } }],
	})
	const bookedToday = () => ({
		where: { ...stillBooked(), startDate: { lte: todayDate() } },
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
								where: stillBooked(),
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
			const t = today(clock, timeZone)
			const bookedOnDay = (r: (typeof requests)[number]) =>
				ymd(r.startDate) <= t && effectiveEnd(r.status, ymd(r.dueDate), t) >= t
			return {
				...rest,
				availableToday: item.status === "ACTIVE" && !requests.some(bookedOnDay),
				committedPeriods: requests.map((r) => ({
					startDate: ymd(r.startDate),
					dueDate: ymd(r.dueDate),
					status: r.status,
					overdue: isOverdue(r.status, ymd(r.dueDate), t),
					...(role === "CUSTODIAN" && { borrower: { displayName: r.borrower.displayName } }),
				})),
			}
		},
	}
}

export type CatalogService = ReturnType<typeof catalogService>
