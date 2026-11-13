/** Response shapes of F-02 (docs/sprints/sprint-1/F-02-catalog.md §4). */
export type Category = { id: string; name: string }

export type ItemStatus = "ACTIVE" | "MAINTENANCE"

export type ItemSummary = {
	id: string
	assetTag: string
	name: string
	status: ItemStatus
	availableToday: boolean
	category: Category
}

export type CommittedPeriod = {
	startDate: string
	dueDate: string
	status: "APPROVED" | "CHECKED_OUT"
	/** Present only for Custodians. */
	borrower?: { displayName: string }
}

export type ItemDetail = ItemSummary & {
	description: string | null
	location: string | null
	committedPeriods: CommittedPeriod[]
}

export const availability = (item: Pick<ItemSummary, "status" | "availableToday">) =>
	item.status === "MAINTENANCE"
		? { label: "Under maintenance", tone: "bg-error-bg text-error-fg border-error-border" }
		: item.availableToday
			? { label: "Available today", tone: "bg-info-bg text-info-fg border-info-border" }
			: { label: "Booked today", tone: "bg-surface text-muted border-line-strong" }
