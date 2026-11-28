import { type BorrowRequest, formatPeriod } from "../api/requests"
import { Dialog } from "./Dialog"
import { Alert, buttonClass } from "./states"

/** F-06 confirm dialog. */
export function CancelDialog({
	request,
	busy,
	error,
	onKeep,
	onConfirm,
}: {
	request: BorrowRequest
	busy: boolean
	error?: string
	onKeep: () => void
	onConfirm: () => void
}) {
	return (
		<Dialog
			title="Cancel request"
			description={`Cancel your request for ${request.item.name} (${formatPeriod(request.startDate, request.dueDate)})? This cannot be undone.`}
			busy={busy}
			onClose={onKeep}>
			{error && <Alert kind="error">{error}</Alert>}
			<div className="flex justify-end gap-3">
				<button type="button" className={buttonClass("secondary")} disabled={busy} onClick={onKeep}>
					Keep request
				</button>
				<button type="button" className={buttonClass("danger")} disabled={busy} onClick={onConfirm}>
					{busy ? "Cancelling…" : "Cancel request"}
				</button>
			</div>
		</Dialog>
	)
}
