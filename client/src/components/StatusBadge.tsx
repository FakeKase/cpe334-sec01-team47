import { availability, type ItemSummary } from "../api/catalog"

export function StatusBadge({ item }: { item: Pick<ItemSummary, "status" | "availableToday"> }) {
	const { label, tone } = availability(item)
	return <span className={`inline-block rounded-full border px-2 py-0.5 text-sm ${tone}`}>{label}</span>
}
