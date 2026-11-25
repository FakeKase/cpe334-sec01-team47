import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"

import { api, type ApiError } from "../api/client"
import { type BorrowRequest, dayMonth, formatPeriod, formatTimestamp, today } from "../api/requests"
import { useApi } from "../api/useApi"
import { Dialog } from "../components/Dialog"
import { card, RequestRow } from "../components/RequestRow"
import { type ReturnCondition, ReturnDialog } from "../components/ReturnDialog"
import { Alert, buttonClass, EmptyState, ErrorState, LoadingState } from "../components/states"
import { Toast } from "../components/Toast"

type Tab = "pending" | "approved" | "checked-out" | "all"
type Action = "approve" | "reject" | "checkout"
type RowState = { busy?: Action; error?: string }

const tabs: { id: Tab; label: string; path: string }[] = [
	{ id: "pending", label: "Pending", path: "/requests?status=PENDING" },
	{ id: "approved", label: "Approved", path: "/requests?status=APPROVED" },
	{ id: "checked-out", label: "Checked out", path: "/requests?status=CHECKED_OUT" },
	{ id: "all", label: "All", path: "/requests" },
]

const emptyStates: Record<Tab, { title: string; hint?: string }> = {
	pending: { title: "No pending requests.", hint: "New borrow requests will appear here." },
	approved: { title: "Nothing to hand over." },
	"checked-out": { title: "Nothing is checked out." },
	all: { title: "No requests yet." },
}

const toasts: Record<Action, string> = {
	approve: "Request approved",
	reject: "Request rejected",
	checkout: "Item checked out",
}

/** BR-09 as the Custodian sees it. The server decides in the end (F-07 §6). */
function checkoutBlock(r: BorrowRequest): string | undefined {
	const now = today()
	if (r.startDate > now) return `Starts ${dayMonth(r.startDate)}`
	if (r.dueDate < now) return "Due date passed, can only be cancelled"
}

/** Figma "Review row": Default, Busy (buttons disabled while the action runs) and Error (409 message on the row).
 * `meta` is the line under the period (when it was submitted, or checked out) and `children` are the buttons. */
function ActionRow({
	r,
	error,
	meta,
	children,
}: {
	r: BorrowRequest
	error?: string
	meta: string
	children: ReactNode
}) {
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
					<p className="text-muted">{meta}</p>
				</div>
				{children}
			</div>
			{error && <Alert kind="error">{error}</Alert>}
		</li>
	)
}

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
		<ActionRow r={r} error={state?.error} meta={`Submitted ${formatTimestamp(r.createdAt)}`}>
			<div className="flex gap-3">
				<button type="button" className={`${buttonClass()} flex-1 md:flex-none`} disabled={!!busy} onClick={onApprove}>
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
		</ActionRow>
	)
}

/** F-07: an approved request waiting to be handed over. Outside the BR-09 window the button is disabled and says why. */
function HandOverRow({ r, state, onCheckout }: { r: BorrowRequest; state?: RowState; onCheckout: () => void }) {
	const blocked = checkoutBlock(r)
	const busy = state?.busy === "checkout"
	return (
		<ActionRow r={r} error={state?.error} meta={`Submitted ${formatTimestamp(r.createdAt)}`}>
			<div className="flex flex-col gap-1 md:items-end">
				<button
					type="button"
					className={`${buttonClass()} md:flex-none`}
					disabled={!!blocked || !!state?.busy}
					aria-describedby={blocked ? `${r.id}-blocked` : undefined}
					onClick={onCheckout}>
					{busy ? "Checking out…" : "Check out"}
				</button>
				{blocked && (
					<p id={`${r.id}-blocked`} className="text-sm text-muted">
						{blocked}
					</p>
				)}
			</div>
		</ActionRow>
	)
}

/** F-07: a loan that is out. Return opens the dialog; the call happens from the page. */
function ReturnRow({ r, state, onReturn }: { r: BorrowRequest; state?: RowState; onReturn: () => void }) {
	return (
		<ActionRow
			r={r}
			error={state?.error}
			meta={r.checkedOutAt ? `Checked out ${formatTimestamp(r.checkedOutAt)}` : "Checked out"}>
			<button type="button" className={`${buttonClass()} md:flex-none`} disabled={!!state?.busy} onClick={onReturn}>
				Return
			</button>
		</ActionRow>
	)
}

/** Confirm needs a non-blank reason (BR-07). */
function RejectDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
	const field = useRef<HTMLTextAreaElement>(null)
	const [reason, setReason] = useState("")

	useEffect(() => field.current?.focus(), [])

	function submit(e: FormEvent) {
		e.preventDefault()
		if (reason.trim()) onConfirm(reason)
	}

	return (
		<Dialog
			title="Reject request"
			description="Give the borrower a reason. They will see it on My requests."
			onClose={onCancel}>
			<form onSubmit={submit} className="flex flex-col gap-4">
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
		</Dialog>
	)
}

/** F-05: the Custodian's pending queue (oldest first, ordered by the server) and every request under All.
 * F-07 adds the Approved tab (hand over) and the Checked out tab (take back). */
export function Requests() {
	const [tab, setTab] = useState<Tab>("pending")
	const { state, retry } = useApi<BorrowRequest[]>(tabs.find((t) => t.id === tab)!.path)
	const [decided, setDecided] = useState<ReadonlySet<string>>(new Set())
	const [rows, setRows] = useState<Record<string, RowState>>({})
	const [rejecting, setRejecting] = useState<BorrowRequest | null>(null)
	const [returning, setReturning] = useState<BorrowRequest | null>(null)
	const [returnBusy, setReturnBusy] = useState(false)
	const [returnError, setReturnError] = useState<string>()
	const [toast, setToast] = useState<{ message: string; at: number } | null>(null)

	useEffect(() => {
		if (!toast) return
		const timer = setTimeout(() => setToast(null), 4000)
		return () => clearTimeout(timer)
	}, [toast])

	const showToast = (message: string) => setToast({ message, at: Date.now() })
	const markDone = (id: string) => setDecided((d) => new Set(d).add(id))

	async function decide(r: BorrowRequest, action: Action, reason?: string) {
		setRows((s) => ({ ...s, [r.id]: { busy: action } }))
		try {
			await api(`/requests/${r.id}/${action}`, { method: "POST", body: reason === undefined ? undefined : { reason } })
			markDone(r.id)
			setRows((s) => ({ ...s, [r.id]: {} }))
			showToast(toasts[action])
		} catch (e) {
			setRows((s) => ({ ...s, [r.id]: { error: (e as ApiError).message } }))
		}
	}

	function closeReturn() {
		setReturning(null)
		setReturnError(undefined)
	}

	/** A 409 or 404 means the request changed under us: say so on its row. Anything else keeps the dialog open (F-07 §6). */
	async function giveBack(r: BorrowRequest, condition: ReturnCondition, note: string) {
		setReturnBusy(true)
		setReturnError(undefined)
		try {
			await api(`/requests/${r.id}/return`, {
				method: "POST",
				body: note.trim() ? { condition, note } : { condition },
			})
			markDone(r.id)
			closeReturn()
			showToast(condition === "DAMAGED" ? "Item returned and set to maintenance" : "Item returned")
		} catch (e) {
			const { status, message } = e as ApiError
			if (status === 409 || status === 404) {
				setRows((s) => ({ ...s, [r.id]: { error: message } }))
				closeReturn()
			} else {
				setReturnError(message)
			}
		} finally {
			setReturnBusy(false)
		}
	}

	// A row that was handled on one tab can still be listed by the server on another, so start each tab clean.
	function openTab(next: Tab) {
		setTab(next)
		setDecided(new Set())
	}

	const queue = state.status === "ok" ? state.data.filter((r) => tab === "all" || !decided.has(r.id)) : []
	const current = tabs.find((t) => t.id === tab)!
	const empty = emptyStates[tab]

	return (
		<div>
			<h1 className="text-[22px] leading-[30px] font-semibold md:text-[28px] md:leading-9">Requests</h1>
			<p className="mt-1 text-secondary">Review borrow requests. Oldest requests are shown first.</p>

			<div role="tablist" aria-label="Requests" className="mt-4 flex overflow-x-auto border-b border-line md:mt-6">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						onClick={() => openTab(t.id)}
						className={`-mb-px h-11 shrink-0 border-b-2 px-4 font-medium ${tab === t.id ? "border-primary text-fg" : "border-transparent text-secondary"}`}>
						{t.label}
					</button>
				))}
			</div>

			<div role="tabpanel" aria-label={current.label} className="mt-4 md:mt-6">
				{state.status === "loading" && (
					<div className={card}>
						<LoadingState message="Loading requests…" />
					</div>
				)}
				{state.status === "error" && <ErrorState onRetry={retry} />}
				{state.status === "ok" &&
					(queue.length === 0 ? (
						<div className={card}>
							<EmptyState title={empty.title}>{empty.hint}</EmptyState>
						</div>
					) : (
						<ul className="flex flex-col gap-3">
							{queue.map((r) => {
								if (tab === "pending")
									return (
										<ReviewRow
											key={r.id}
											r={r}
											state={rows[r.id]}
											onApprove={() => decide(r, "approve")}
											onReject={() => setRejecting(r)}
										/>
									)
								if (tab === "approved")
									return <HandOverRow key={r.id} r={r} state={rows[r.id]} onCheckout={() => decide(r, "checkout")} />
								if (tab === "checked-out")
									return <ReturnRow key={r.id} r={r} state={rows[r.id]} onReturn={() => setReturning(r)} />
								return <RequestRow key={r.id} r={r} showBorrower />
							})}
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

			{returning && (
				<ReturnDialog
					request={returning}
					busy={returnBusy}
					error={returnError}
					onCancel={closeReturn}
					onConfirm={(condition, note) => void giveBack(returning, condition, note)}
				/>
			)}

			<Toast message={toast?.message} />
		</div>
	)
}
