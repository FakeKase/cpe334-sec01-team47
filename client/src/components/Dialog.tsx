import { type ReactNode, useEffect, useId, useRef } from "react"

/** Native modal dialog shared by the reject, cancel and retire dialogs: focus trap, Esc and the backdrop come
 * from the browser. Esc is ignored while `busy`. `children` holds the dialog's fields and buttons. */
export function Dialog({
	title,
	description,
	busy = false,
	onClose,
	children,
}: {
	title: string
	description: ReactNode
	busy?: boolean
	onClose: () => void
	children: ReactNode
}) {
	const dialog = useRef<HTMLDialogElement>(null)
	const id = useId()

	useEffect(() => {
		dialog.current?.showModal()
	}, [])

	return (
		<dialog
			ref={dialog}
			onCancel={(e) => busy && e.preventDefault()}
			onClose={onClose}
			aria-labelledby={`${id}-title`}
			aria-describedby={`${id}-description`}
			className="mx-auto mt-30 w-[calc(100%-2rem)] max-w-120 rounded-xl bg-surface p-6 text-fg shadow-[0_8px_24px_-4px_rgb(15_23_41/0.18)] backdrop:bg-overlay/50 md:mt-40">
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h2 id={`${id}-title`} className="text-lg font-semibold">
						{title}
					</h2>
					<p id={`${id}-description`} className="text-sm break-words text-secondary">
						{description}
					</p>
				</div>
				{children}
			</div>
		</dialog>
	)
}
