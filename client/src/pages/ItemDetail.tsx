import { Link, useParams } from "react-router"

import type { ItemDetail as Item } from "../api/catalog"
import { useApi } from "../api/useApi"
import { useAuth } from "../auth/AuthContext"
import { buttonClass, ErrorState, LoadingState } from "../components/states"
import { StatusBadge } from "./Catalog"
import { RequestForm } from "./RequestForm"
import { NotFound } from "./SystemPages"

export function ItemDetail() {
	const { id = "" } = useParams()
	const { user } = useAuth()
	const { state, retry } = useApi<Item>(`/items/${encodeURIComponent(id)}`)

	if (state.status === "loading") return <LoadingState message="Loading item…" />
	if (state.status === "error") return state.error.status === 404 ? <NotFound /> : <ErrorState onRetry={retry} />
	const item = state.data

	return (
		<div>
			<Link to="/items" className="text-sm text-muted underline underline-offset-4">
				← Back to catalog
			</Link>
			<div className="mt-3 flex flex-wrap items-center gap-3">
				<h1 className="text-2xl font-semibold">{item.name}</h1>
				<StatusBadge item={item} />
			</div>

			<dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
				<dt className="text-muted">Asset tag</dt>
				<dd>{item.assetTag}</dd>
				<dt className="text-muted">Category</dt>
				<dd>{item.category.name}</dd>
				{item.location && (
					<>
						<dt className="text-muted">Location</dt>
						<dd>{item.location}</dd>
					</>
				)}
				{item.description && (
					<>
						<dt className="text-muted">Description</dt>
						<dd>{item.description}</dd>
					</>
				)}
			</dl>

			<section className="mt-6">
				<h2 className="text-lg font-semibold">Booked periods</h2>
				{item.committedPeriods.length === 0 ? (
					<p className="mt-2 text-muted">No upcoming bookings.</p>
				) : (
					<ul className="mt-2 flex flex-col gap-2">
						{item.committedPeriods.map((p) => (
							<li key={`${p.startDate}-${p.dueDate}`} className="rounded-lg border border-line bg-surface px-3 py-2">
								{p.startDate} – {p.dueDate}
								{p.borrower && <span className="text-muted"> · {p.borrower.displayName}</span>}
							</li>
						))}
					</ul>
				)}
			</section>

			{user?.role === "BORROWER" && (
				<section className="mt-6">
					<h2 className="text-lg font-semibold">Request this item</h2>
					{item.status === "ACTIVE" ? (
						<RequestForm itemId={item.id} />
					) : (
						<>
							<p className="mt-2 text-muted">This item is under maintenance and cannot be requested.</p>
							<button type="button" disabled className={`${buttonClass()} mt-3`}>
								Submit request
							</button>
						</>
					)}
				</section>
			)}
		</div>
	)
}
