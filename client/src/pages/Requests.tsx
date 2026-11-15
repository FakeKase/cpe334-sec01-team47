import { type FormEvent, useEffect, useRef, useState } from "react"

import { api, type ApiError } from "../api/client"
import { type BorrowRequest, formatPeriod, formatTimestamp } from "../api/requests"
import { useApi } from "../api/useApi"
import { card, RequestRow } from "../components/RequestRow"
import { Alert, buttonClass, EmptyState, ErrorState, LoadingState } from "../components/states"

type Tab = "pending" | "all"
type Action = "approve" | "reject"
type RowState = { busy?: Action; error?: string }

const tabs: { id: Tab; label: string }[] = [
	{ id: "pending", label: "Pending" },
	{ id: "all", label: "All" },
]

/** Figma "Review row": Default, Busy (buttons disabled while the action runs) and Error (409 message on the row). */
function ReviewRow({
	r,
	state,
	onApprove,
	onReject,
}: {
	r: BorrowRequest
	state?: RowState
	onApprove: () => void
	onReject: () => void
}) {
	const busy = state?.busy
	return (
		<li className={`${card} flex flex-col gap-3 p-4 md:px-5`}>
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
				<div className="flex min-w-0 flex-col gap-1 md:flex-1">
					<p className="font-medium">{r.borrower.displayName}</p>
					<p className="text-sm text-secondary">
						{r.item.name} · {r.item.assetTag}
					</p>
					<p className="text-sm text-muted">Purpose: {r.purpose}</p>
				</div>
				<div className="flex flex-col gap-1 text-sm">
					<p className="font-medium">{formatPeriod(r.startDate, r.dueDate)}</p>
					<p className="text-muted">Submitted {formatTimestamp(r.createdAt)}</p>
				</div>
				<div className="flex gap-3">
					<button
						type="button"
						className={`${buttonClass()} flex-1 md:flex-none`}
						disabled={!!busy}
						onClick={onApprove}>
						{busy === "approve" ? "Approving…" : "Approve"}
					</button>
					<button
						type="button"
						className={`${buttonClass("secondary")} flex-1 md:flex-none`}
						disabled={!!busy}
						onClick={onReject}>
						{busy === "reject" ? "Rejecting…" : "Reject"}
					</button>
				</div>
			</div>
			{state?.error && <Alert kind="error">{state.error}</Alert>}
		</li>
	)
}

/** Native modal dialog: focus trap, Esc and the backdrop come from the browser. Confirm needs a non-blank reason (BR-07). */
function RejectDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
	const dialog = useRef<HTMLDialogElement>(null)
	const field = useRef<HTMLTextAreaElement>(null)
	const [reason, setReason] = useState("")

	useEffect(() => {
		dialog.current?.showModal()
		field.current?.focus()
	}, [])

	function submit(e: FormEvent) {
		e.preventDefault()
		if (reason.trim()) onConfirm(reason)
	}

	return (
		<dialog
			ref={dialog}
			onClose={onCancel}
			aria-labelledby="reject-title"
			aria-describedby="reject-description"
			className="mx-auto mt-30 w-[calc(100%-2rem)] max-w-120 rounded-xl bg-surface p-6 text-fg shadow-[0_8px_24px_-4px_rgb(15_23_41/0.18)] backdrop:bg-overlay/50 md:mt-40">
			<form onSubmit={submit} className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h2 id="reject-title" className="text-lg font-semibold">
						Reject request
					</h2>
					<p id="reject-description" className="text-sm text-secondary">
						Give the borrower a reason. They will see it on My requests.
					</p>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="reject-reason" className="text-sm font-medium">
						Reason (required)
					</label>
					<textarea
						ref={field}
						id="reject-reason"
						required
						maxLength={500}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						aria-describedby="reject-count"
						className="h-24 resize-none rounded-lg border border-line-strong bg-surface p-3"
					/>
					<p id="reject-count" className="text-right text-sm text-muted">
						{reason.length}/500
					</p>
				</div>
				<div className="flex justify-end gap-3">
					<button type="button" className={buttonClass("secondary")} onClick={onCancel}>
						Cancel
					</button>
					<button type="submit" className={buttonClass("danger")} disabled={!reason.trim()}>
						Confirm
					</button>
				</div>
			</form>
		</dialog>
	)
}

function CheckIcon() {
	return (
		<svg
			viewBox="0 0 20 20"
			className="size-5 shrink-0"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.67"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true">
			<circle cx="10" cy="10" r="7.5" />
			<path d="m7.08 10.42 2.09 2.08 3.75-4.17" />
		</svg>
	)
}

/** F-05: the Custodian's pending queue (oldest first, ordered by the server) and every request under All. */
export function Requests() {
	const [tab, setTab] = useState<Tab>("pending")
	const { state, retry } = useApi<BorrowRequest[]>(tab === "pending" ? "/requests?status=PENDING" : "/requests")
	const [decided, setDecided] = useState<ReadonlySet<string>>(new Set())
	const [rows, setRows] = useState<Record<string, RowState>>({})
	const [rejecting, setRejecting] = useState<BorrowRequest | null>(null)
	const [toast, setToast] = useState<{ message: string; at: number } | null>(null)

	useEffect(() => {
		if (!toast) return
		const timer = setTimeout(() => setToast(null), 4000)
		return () => clearTimeout(timer)
	}, [toast])

	async function decide(r: BorrowRequest, action: Action, reason?: string) {
		setRows((s) => ({ ...s, [r.id]: { busy: action } }))
		try {
			await api(`/requests/${r.id}/${action}`, { method: "POST", body: reason === undefined ? undefined : { reason } })
			setDecided((d) => new Set(d).add(r.id))
			setRows((s) => ({ ...s, [r.id]: {} }))
			setToast({ message: action === "approve" ? "Request approved" : "Request rejected", at: Date.now() })
		} catch (e) {
			setRows((s) => ({ ...s, [r.id]: { error: (e as ApiError).message } }))
		}
	}

	const queue = state.status === "ok" ? state.data.filter((r) => tab === "all" || !decided.has(r.id)) : []

	return (
		<div>
			<h1 className="text-[22px] leading-[30px] font-semibold md:text-[28px] md:leading-9">Requests</h1>
			<p className="mt-1 text-secondary">Review borrow requests. Oldest requests are shown first.</p>

			<div role="tablist" aria-label="Requests" className="mt-4 flex border-b border-line md:mt-6">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						onClick={() => setTab(t.id)}
						className={`-mb-px h-11 border-b-2 px-4 font-medium ${tab === t.id ? "border-primary text-fg" : "border-transparent text-secondary"}`}>
						{t.label}
					</button>
				))}
			</div>

			<div role="tabpanel" aria-label={tab === "pending" ? "Pending" : "All"} className="mt-4 md:mt-6">
				{state.status === "loading" && (
					<div className={card}>
						<LoadingState message="Loading requests…" />
					</div>
				)}
				{state.status === "error" && <ErrorState onRetry={retry} />}
				{state.status === "ok" &&
					(queue.length === 0 ? (
						<div className={card}>
							{tab === "pending" ? (
								<EmptyState title="No pending requests.">New borrow requests will appear here.</EmptyState>
							) : (
								<EmptyState title="No requests yet." />
							)}
						</div>
					) : (
						<ul className="flex flex-col gap-3">
							{queue.map((r) =>
								tab === "pending" ? (
									<ReviewRow
										key={r.id}
										r={r}
										state={rows[r.id]}
										onApprove={() => decide(r, "approve")}
										onReject={() => setRejecting(r)}
									/>
								) : (
									<RequestRow key={r.id} r={r} showBorrower />
								)
							)}
						</ul>
					))}
			</div>

			{rejecting && (
				<RejectDialog
					onCancel={() => setRejecting(null)}
					onConfirm={(reason) => {
						setRejecting(null)
						void decide(rejecting, "reject", reason)
					}}
				/>
			)}

			{/* Always mounted so screen readers announce the message when it appears. */}
			<output className="fixed right-6 bottom-6 z-10">
				{toast && (
					<div className="flex items-center gap-3 rounded-lg bg-inverse px-4 py-3 text-sm font-medium text-on-inverse shadow-[0_8px_24px_-4px_rgb(15_23_41/0.18)]">
						<CheckIcon />
						{toast.message}
					</div>
				)}
			</output>
		</div>
	)
}
