import { useState } from "react"
import { Link } from "react-router"

import { availability, type Category, type ItemSummary } from "../api/catalog"
import { useApi } from "../api/useApi"
import { EmptyState, ErrorState, LoadingState } from "../components/states"

export function StatusBadge({ item }: { item: Pick<ItemSummary, "status" | "availableToday"> }) {
	const { label, tone } = availability(item)
	return <span className={`inline-block rounded-full border px-2 py-0.5 text-sm ${tone}`}>{label}</span>
}

export function Catalog() {
	const [categoryId, setCategoryId] = useState("")
	const categories = useApi<Category[]>("/categories")
	const items = useApi<ItemSummary[]>(categoryId ? `/items?categoryId=${encodeURIComponent(categoryId)}` : "/items")

	return (
		<div>
			<h1 className="text-2xl font-semibold">Catalog</h1>

			<div className="mt-4 flex max-w-xs flex-col gap-1">
				<label htmlFor="category" className="text-sm font-medium">
					Category
				</label>
				<select
					id="category"
					value={categoryId}
					onChange={(e) => setCategoryId(e.target.value)}
					disabled={categories.state.status !== "ok"}
					className="min-h-11 rounded-lg border border-line-strong bg-page px-3 text-fg">
					<option value="">All categories</option>
					{categories.state.status === "ok" &&
						categories.state.data.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
				</select>
			</div>

			{items.state.status === "loading" && <LoadingState message="Loading items…" />}
			{items.state.status === "error" && <ErrorState onRetry={items.retry} />}
			{items.state.status === "ok" &&
				(items.state.data.length === 0 ? (
					<EmptyState title="No items in this category." />
				) : (
					<ul className="mt-4 flex flex-col gap-3">
						{items.state.data.map((item) => (
							<li
								key={item.id}
								className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4">
								<div className="min-w-0 flex-1">
									<p className="font-medium">{item.name}</p>
									<p className="text-sm text-muted">
										{item.assetTag} · {item.category.name}
									</p>
								</div>
								<StatusBadge item={item} />
								<Link
									to={`/items/${item.id}`}
									aria-label={`View ${item.name}`}
									className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 font-medium">
									View
								</Link>
							</li>
						))}
					</ul>
				))}
		</div>
	)
}
