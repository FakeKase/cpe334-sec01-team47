import type { ReactNode } from "react"

export const buttonClass = (style: "primary" | "secondary" = "primary") =>
	`inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
		style === "primary" ? "bg-primary text-on-primary" : "border border-line-strong bg-surface text-fg"
	}`

export function LoadingState({ message }: { message: string }) {
	return <output className="block py-10 text-center text-muted">{message}</output>
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className="py-10 text-center">
			<p className="font-medium">{title}</p>
			{children && <p className="mt-1 text-sm text-muted">{children}</p>}
		</div>
	)
}

/** 5xx / network error: a generic message with Retry, no technical details (SDS C3.2). */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div role="alert" className="py-10 text-center">
			<p className="font-medium">Something went wrong. Please try again.</p>
			<button type="button" onClick={onRetry} className={`${buttonClass("secondary")} mt-4`}>
				Retry
			</button>
		</div>
	)
}

export function Alert({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
	return (
		<div
			role={kind === "error" ? "alert" : "status"}
			className={`rounded-lg border px-3 py-2 text-sm ${
				kind === "error"
					? "border-error-border bg-error-bg text-error-fg"
					: "border-info-border bg-info-bg text-info-fg"
			}`}>
			{children}
		</div>
	)
}
