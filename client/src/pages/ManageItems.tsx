import { Link, useLocation } from "react-router"

import type { ItemSummary } from "../api/catalog"
import { useApi } from "../api/useApi"
import { buttonClass, EmptyState, ErrorState, LoadingState } from "../components/states"
import { Toast } from "../components/Toast"
import { useToast } from "../components/useToast"
import { StatusBadge } from "./Catalog"

/** F-09: every item, retired ones included, with a link to its edit page. */
export function ManageItems() {
	const location = useLocation()
	const [toast] = useToast((location.state as { toast?: string } | null)?.toast)
	const { state, retry } = useApi<ItemSummary[]>("/items?includeRetired=true")

	return (
		<div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Inventory</h1>
				<Link to="/manage/items/new" className={buttonClass()}>
					Add item
				</Link>
			</div>

			{state.status === "loading" && <LoadingState message="Loading items…" />}
			{state.status === "error" && <ErrorState onRetry={retry} />}
			{state.status === "ok" &&
				(state.data.length === 0 ? (
					<EmptyState title="No items yet." />
				) : (
					<ul className="mt-4 flex flex-col gap-3">
						{state.data.map((item) => (
							<li
								key={item.id}
								className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4">
								<div className="min-w-0 flex-1">
									<p className="font-medium break-words">{item.name}</p>
									<p className="text-sm text-muted">
										{item.assetTag} · {item.category.name}
									</p>
								</div>
								<StatusBadge item={item} />
								<Link
									to={`/manage/items/${item.id}`}
									aria-label={`Edit ${item.name}`}
									className={buttonClass("secondary")}>
									Edit
								</Link>
							</li>
						))}
					</ul>
				))}

			<Toast message={toast} />
		</div>
	)
}
