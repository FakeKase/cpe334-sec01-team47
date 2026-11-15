import { useState } from "react"

/** Starts from the system setting (index.html applies it), then saves the choice the user makes. */
export function ThemeToggle() {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))

	const toggle = () => {
		const next = !dark
		document.documentElement.classList.toggle("dark", next)
		try {
			localStorage.setItem("theme", next ? "dark" : "light")
		} catch {
			// Storage can be blocked; the choice then lasts for this visit only.
		}
		setDark(next)
	}

	return (
		<button
			type="button"
			onClick={toggle}
			aria-pressed={dark}
			aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
			className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-surface text-fg">
			<svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
				{dark ? (
					<>
						<circle cx="12" cy="12" r="4" />
						<path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
					</>
				) : (
					<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
				)}
			</svg>
		</button>
	)
}
