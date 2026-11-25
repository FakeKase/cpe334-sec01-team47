import { useEffect, useRef, useState } from "react"

import { type BorrowRequest, formatPeriod } from "../api/requests"
import { Alert, buttonClass } from "./states"

export type ReturnCondition = "GOOD" | "DAMAGED"

/** F-07 return dialog. Native modal, like CancelDialog: focus trap and Esc come from the browser, and Esc is ignored
 * while the call runs. Nothing is preselected, so the Custodian has to choose the condition (F-07 §6). */
export function ReturnDialog({
	request,
	busy,
	error,
	onCancel,
	onConfirm,
}: {
	request: BorrowRequest
	busy: boolean
	error?: string
	onCancel: () => void
	onConfirm: (condition: ReturnCondition, note: string) => void
}) {
	const dialog = useRef<HTMLDialogElement>(null)
	const [condition, setCondition] = useState<ReturnCondition>()
	const [note, setNote] = useState("")

	useEffect(() => {
		dialog.current?.showModal()
	}, [])

	return (
		<dialog
			ref={dialog}
			onCancel={(e) => busy && e.preventDefault()}
			onClose={onCancel}
			aria-labelledby="return-title"
			aria-describedby="return-description"
			className="mx-auto mt-30 w-[calc(100%-2rem)] max-w-120 rounded-xl bg-surface p-6 text-fg shadow-[0_8px_24px_-4px_rgb(15_23_41/0.18)] backdrop:bg-overlay/50 md:mt-40">
			<form
				onSubmit={(e) => {
					e.preventDefault()
					if (condition && !busy) onConfirm(condition, note)
				}}
				className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h2 id="return-title" className="text-lg font-semibold">
						Return item
					</h2>
					<p id="return-description" className="text-sm text-secondary">
						{request.item.name} · {request.item.assetTag}, borrowed by {request.borrower.displayName} (
						{formatPeriod(request.startDate, request.dueDate)}).
					</p>
				</div>

				<fieldset className="flex flex-col gap-2">
					<legend className="mb-1 text-sm font-medium">Condition (required)</legend>
					{(["GOOD", "DAMAGED"] as const).map((value) => (
						<label key={value} className="flex min-h-11 items-center gap-3">
							<input
								type="radio"
								name="condition"
								value={value}
								checked={condition === value}
								onChange={() => setCondition(value)}
								disabled={busy}
								className="size-5"
							/>
							{value === "GOOD" ? "Good" : "Damaged"}
						</label>
					))}
				</fieldset>

				{condition === "DAMAGED" && (
					<Alert kind="info">
						The item will be set to maintenance and cannot be requested until a Custodian makes it available again.
					</Alert>
				)}

				<div className="flex flex-col gap-1">
					<label htmlFor="return-note" className="text-sm font-medium">
						Note (optional)
					</label>
					<textarea
						id="return-note"
						maxLength={500}
						value={note}
						onChange={(e) => setNote(e.target.value)}
						disabled={busy}
						aria-describedby="return-count"
						className="h-24 resize-none rounded-lg border border-line-strong bg-surface p-3"
					/>
					<p id="return-count" className="text-right text-sm text-muted">
						{note.length}/500
					</p>
				</div>

				{error && <Alert kind="error">{error}</Alert>}
				<div className="flex justify-end gap-3">
					<button type="button" className={buttonClass("secondary")} disabled={busy} onClick={onCancel}>
						Cancel
					</button>
					<button type="submit" className={buttonClass()} disabled={!condition || busy}>
						{busy ? "Returning…" : "Return item"}
					</button>
				</div>
			</form>
		</dialog>
	)
}
