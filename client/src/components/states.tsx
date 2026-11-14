import type { ReactNode } from "react"

export const buttonClass = (style: "primary" | "secondary" = "primary") =>
	`inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
		style === "primary" ? "bg-primary text-on-primary" : "border border-line-strong bg-surface text-fg"
	}`

export function LoadingState({ message }: { message: string }) {
	return (
		<output className="flex items-center justify-center gap-2 py-10 text-secondary">
			<svg viewBox="0 0 24 24" className="size-5 animate-spin text-muted" fill="none" aria-hidden="true">
				<path d="M21 12a9 9 0 1 1-6.2-8.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			</svg>
			{message}
		</output>
	)
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className="py-10 text-center">
			<p className="font-medium">{title}</p>
			{children && <div className="mt-1 text-sm text-secondary">{children}</div>}
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

const alertTone = {
	error: "border-error-border bg-error-bg text-error-fg",
	info: "border-info-border bg-info-bg text-info-fg",
	success: "border-success-border bg-success-bg text-fg",
}

export function Alert({ kind, children }: { kind: keyof typeof alertTone; children: ReactNode }) {
	return (
		<div
			role={kind === "error" ? "alert" : "status"}
			className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${alertTone[kind]}`}>
			{kind === "success" && (
				<svg
					viewBox="0 0 24 24"
					className="size-4 shrink-0 text-success-icon"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true">
					<circle cx="12" cy="12" r="9" />
					<path d="m8.5 12 2.5 2.5 4.5-5" />
				</svg>
			)}
			{children}
		</div>
	)
}
