/** Field styles and errors shared by the forms (F-03 request form, F-09 item form). */
export const input = "min-h-11 w-full rounded-lg border bg-page px-3 text-fg"
export const border = (error?: string) => (error ? "border-error-fg" : "border-line-strong")

/** `aria-describedby` for field `id`: its error only while there is one, plus any ids that are always shown. */
export const describedBy = (id: string, error?: string, ...always: string[]) =>
	[error && `${id}-error`, ...always].filter(Boolean).join(" ") || undefined

export function FieldError({ id, message }: { id: string; message?: string }) {
	return message ? (
		<p id={id} className="text-sm text-error-fg">
			{message}
		</p>
	) : null
}
