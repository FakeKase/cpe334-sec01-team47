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

/** Bottom-right confirmation. Always mounted so screen readers announce the message when it appears. */
export function Toast({ message }: { message?: string }) {
	return (
		<output className="fixed right-6 bottom-6 z-10">
			{message && (
				<div className="flex items-center gap-3 rounded-lg bg-inverse px-4 py-3 text-sm font-medium text-on-inverse shadow-[0_8px_24px_-4px_rgb(15_23_41/0.18)]">
					<CheckIcon />
					{message}
				</div>
			)}
		</output>
	)
}
