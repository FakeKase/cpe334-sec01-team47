import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router"

import type { BorrowRequest } from "../api/requests"
import { useApi } from "../api/useApi"
import { card, RequestRow } from "../components/RequestRow"
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/states"

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
