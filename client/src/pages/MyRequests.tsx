import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router"

import { api, type ApiError } from "../api/client"
import type { BorrowRequest } from "../api/requests"
import { useApi } from "../api/useApi"
import { CancelDialog } from "../components/CancelDialog"
import { card, RequestRow } from "../components/RequestRow"
import { Alert, buttonClass, EmptyState, ErrorState, LoadingState } from "../components/states"
import { Toast } from "../components/Toast"

const cancellable = (r: BorrowRequest) => r.status === "PENDING" || r.status === "APPROVED"

/** F-04: the Borrower's own requests, newest first (the server applies the scope and the order). F-06 adds Cancel. */
export function MyRequests() {
	const { state, retry } = useApi<BorrowRequest[]>("/requests")
	const [cancelling, setCancelling] = useState<BorrowRequest | null>(null)
	const [busy, setBusy] = useState(false)
	const [dialogError, setDialogError] = useState<string>()
	const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
	// A cancelled request replaces its row until the next load, so the list does not flash or jump.
	const [updated, setUpdated] = useState<Record<string, BorrowRequest>>({})
	const [toast, setToast] = useState<string>()

	useEffect(() => {
		if (!toast) return
		const timer = setTimeout(() => setToast(undefined), 4000)
		return () => clearTimeout(timer)
	}, [toast])

	function closeDialog() {
		setCancelling(null)
		setDialogError(undefined)
	}

	async function confirmCancel(r: BorrowRequest) {
		setBusy(true)
		setDialogError(undefined)
		try {
			const result = await api<BorrowRequest>(`/requests/${r.id}/cancel`, { method: "POST" })
			setUpdated((u) => ({ ...u, [r.id]: result }))
			setRowErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([id]) => id !== r.id)))
			setToast("Request cancelled")
			closeDialog()
		} catch (e) {
			const { status, message } = e as ApiError
			if (status === 409 || status === 404) {
				// The request is no longer cancellable (F-06 §6): say why on its row and reload the list.
				setRowErrors((errs) => ({ ...errs, [r.id]: message }))
				closeDialog()
				retry()
			} else setDialogError(message)
		} finally {
			setBusy(false)
		}
	}
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
							{state.data.map((original) => {
								const r = updated[original.id] ?? original
								return (
									<RequestRow
										key={r.id}
										r={r}
										error={rowErrors[r.id]}
										action={
											cancellable(r) && (
												<button type="button" className={buttonClass("secondary")} onClick={() => setCancelling(r)}>
													Cancel
												</button>
											)
										}
									/>
								)
							})}
						</ul>
					))}
			</div>

			{cancelling && (
				<CancelDialog
					request={cancelling}
					busy={busy}
					error={dialogError}
					onKeep={closeDialog}
					onConfirm={() => void confirmCancel(cancelling)}
				/>
			)}
			<Toast message={toast} />
		</div>
	)
}
