import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router"

import { type BorrowRequest, formatPeriod, formatTimestampDate, requestStatus } from "../api/requests"
import { useApi } from "../api/useApi"
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/states"

const card = "rounded-xl border border-line bg-surface"

function RequestStatusBadge({ status }: Pick<BorrowRequest, "status">) {
	const { label, tone } = requestStatus[status]
	return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}

/** Desktop: one line with item, period, badge and submitted date. Mobile (360): stacked, badge beside the date. */
function RequestRow({ r }: { r: BorrowRequest }) {
	return (
		<li
			className={`${card} grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 p-4 md:grid-cols-[minmax(0,1fr)_14rem_8rem_auto]`}>
			<div className="col-span-2 min-w-0 md:col-span-1">
				<p className="font-medium">{r.item.name}</p>
				<p className="text-sm text-muted">{r.item.assetTag}</p>
			</div>
			<p className="col-span-2 text-sm font-medium md:col-span-1">{formatPeriod(r.startDate, r.dueDate)}</p>
			<div>
				<RequestStatusBadge status={r.status} />
			</div>
			<p className="text-sm text-muted md:text-right">Submitted {formatTimestampDate(r.createdAt)}</p>
			{r.status === "REJECTED" && r.rejectionReason && (
				<p className="col-span-full mt-1 text-sm text-secondary">Reason: {r.rejectionReason}</p>
			)}
		</li>
	)
}

/** F-04: the Borrower's own requests, newest first (the server applies the scope and the order). */
export function MyRequests() {
	const { state, retry } = useApi<BorrowRequest[]>("/requests")
	// F-03 navigates here with `{ state: { submitted: true } }` after a successful submit. The flag is read once and
	// then cleared from history, so Back or a reload does not show the banner again.
	const location = useLocation()
	const navigate = useNavigate()
	const [submitted] = useState(() => (location.state as { submitted?: boolean } | null)?.submitted === true)
	useEffect(() => {
		if (location.state) navigate(location.pathname, { replace: true, state: null })
	}, [location.state, location.pathname, navigate])

	return (
		<div>
			<h1 className="text-2xl font-semibold">My requests</h1>
			<p className="mt-1 text-secondary">Track your borrow requests and their status.</p>
			{submitted && (
				<div className="mt-5">
					<Alert kind="success">Request submitted. Waiting for approval.</Alert>
				</div>
			)}

			<div className="mt-5">
				{state.status === "loading" && (
					<div className={card}>
						<LoadingState message="Loading your requests…" />
					</div>
				)}
				{state.status === "error" && <ErrorState onRetry={retry} />}
				{state.status === "ok" &&
					(state.data.length === 0 ? (
						<div className={card}>
							<EmptyState title="You have no requests yet.">
								<p>Browse the catalog and request equipment for the dates you need.</p>
								<Link
									to="/items"
									className="mt-1 inline-block font-medium text-link underline-offset-4 hover:underline">
									Go to the catalog
								</Link>
							</EmptyState>
						</div>
					) : (
						<ul className="flex flex-col gap-3">
							{state.data.map((r) => (
								<RequestRow key={r.id} r={r} />
							))}
						</ul>
					))}
			</div>
		</div>
	)
}
