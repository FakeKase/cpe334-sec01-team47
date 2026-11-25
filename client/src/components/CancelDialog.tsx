import { useEffect, useRef } from "react"

import { type BorrowRequest, formatPeriod } from "../api/requests"
import { Alert, buttonClass } from "./states"

/** F-06 confirm dialog. Native modal: focus trap, Esc and the backdrop come from the browser. Esc is ignored while the call runs. */
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
	const dialog = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		dialog.current?.showModal()
	}, [])

	return (
		<dialog
			ref={dialog}
			onCancel={(e) => busy && e.preventDefault()}
			onClose={onKeep}
			aria-labelledby="cancel-title"
			aria-describedby="cancel-description"
			className="mx-auto mt-30 w-[calc(100%-2rem)] max-w-120 rounded-xl bg-surface p-6 text-fg shadow-[0_8px_24px_-4px_rgb(15_23_41/0.18)] backdrop:bg-overlay/50 md:mt-40">
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h2 id="cancel-title" className="text-lg font-semibold">
						Cancel request
					</h2>
					<p id="cancel-description" className="text-sm text-secondary">
						Cancel your request for {request.item.name} ({formatPeriod(request.startDate, request.dueDate)})? This
						cannot be undone.
					</p>
				</div>
				{error && <Alert kind="error">{error}</Alert>}
				<div className="flex justify-end gap-3">
					<button type="button" className={buttonClass("secondary")} disabled={busy} onClick={onKeep}>
						Keep request
					</button>
					<button type="button" className={buttonClass("danger")} disabled={busy} onClick={onConfirm}>
						{busy ? "Cancelling…" : "Cancel request"}
					</button>
				</div>
			</div>
		</dialog>
	)
}
