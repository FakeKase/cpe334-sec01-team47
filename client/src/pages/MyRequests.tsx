import { Link, useLocation } from "react-router"

import { type BorrowRequest, formatPeriod, formatTimestampDate, requestStatus } from "../api/requests"
import { useApi } from "../api/useApi"
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/states"

function RequestStatusBadge({ status }: Pick<BorrowRequest, "status">) {
	const { label, tone } = requestStatus[status]
	return <span className={`inline-block rounded-full border px-2 py-0.5 text-sm ${tone}`}>{label}</span>
}

/** F-04: the Borrower's own requests, newest first (the server applies the scope and the order). */
export function MyRequests() {
	const { state, retry } = useApi<BorrowRequest[]>("/requests")
	// F-03 navigates here with `{ state: { submitted: true } }` after a successful submit.
	const submitted = (useLocation().state as { submitted?: boolean } | null)?.submitted

	return (
		<div>
			<h1 className="text-2xl font-semibold">My requests</h1>
			{submitted && (
				<div className="mt-4">
					<Alert kind="info">Your request was submitted.</Alert>
				</div>
			)}

			{state.status === "loading" && <LoadingState message="Loading your requests…" />}
			{state.status === "error" && <ErrorState onRetry={retry} />}
			{state.status === "ok" &&
				(state.data.length === 0 ? (
					<EmptyState title="You have no requests yet.">
						<Link to="/items" className="underline underline-offset-4">
							Browse the catalog
						</Link>
					</EmptyState>
				) : (
					<ul className="mt-4 flex flex-col gap-3">
						{state.data.map((r) => (
							<li key={r.id} className="rounded-xl border border-line bg-surface p-4">
								<div className="flex flex-wrap items-start gap-x-4 gap-y-2">
									<div className="min-w-0 flex-1">
										<p className="font-medium">{r.item.name}</p>
										<p className="text-sm text-muted">{r.item.assetTag}</p>
									</div>
									<RequestStatusBadge status={r.status} />
								</div>
								<p className="mt-2">{formatPeriod(r.startDate, r.dueDate)}</p>
								<p className="text-sm text-muted">Submitted {formatTimestampDate(r.createdAt)}</p>
								{r.status === "REJECTED" && r.rejectionReason && (
									<p className="mt-2 text-sm text-error-fg">Reason: {r.rejectionReason}</p>
								)}
							</li>
						))}
					</ul>
				))}
		</div>
	)
}
