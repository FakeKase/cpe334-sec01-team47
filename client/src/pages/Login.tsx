import { type FormEvent, useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router"

import { ApiError } from "../api/client"
import { homeFor, useAuth } from "../auth/AuthContext"
import { Alert, buttonClass } from "../components/states"
import { ThemeToggle } from "../components/ThemeToggle"

const field = "min-h-11 w-full rounded-lg border border-line-strong bg-page px-3 text-fg placeholder:text-muted"

export function Login() {
	const { user, login } = useAuth()
	const navigate = useNavigate()
	const [params] = useSearchParams()
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState("")
	const [submitting, setSubmitting] = useState(false)

	if (user) return <Navigate to={homeFor(user.role)} replace />

	async function submit(e: FormEvent) {
		e.preventDefault()
		setError("")
		setSubmitting(true)
		try {
			const signedIn = await login(email, password)
			navigate(homeFor(signedIn.role), { replace: true })
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
			setSubmitting(false)
		}
	}

	return (
		<main className="relative flex min-h-screen flex-col items-center px-4 pt-16">
			<div className="absolute right-4 top-4">
				<ThemeToggle />
			</div>
			<div
				className="flex size-10 items-center justify-center rounded-lg bg-inverse text-on-inverse"
				aria-hidden="true">
				<svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
					<path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" />
				</svg>
			</div>
			<h1 className="mt-3 text-xl font-semibold">YeumPeunMa</h1>
			<p className="mt-1 text-center text-sm text-muted">Inventory and Borrowing System · CPE Equipment Room</p>

			<form
				onSubmit={submit}
				className="mt-6 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-line bg-surface p-6">
				<h2 className="text-lg font-semibold">Log in</h2>
				{params.get("expired") && !error && <Alert kind="info">Your session has ended. Please log in again.</Alert>}
				{error && <Alert kind="error">{error}</Alert>}
				<div className="flex flex-col gap-1">
					<label htmlFor="email" className="text-sm font-medium">
						Email
					</label>
					<input
						id="email"
						type="email"
						autoComplete="username"
						required
						placeholder="name@example.test"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className={field}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="password" className="text-sm font-medium">
						Password
					</label>
					<input
						id="password"
						type="password"
						autoComplete="current-password"
						required
						maxLength={200}
						placeholder="Enter your password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className={field}
					/>
				</div>
				<button type="submit" disabled={submitting} className={buttonClass()}>
					Log in
				</button>
				<p className="text-center text-sm text-muted">
					Accounts are created by the equipment room. Self-registration is not available.
				</p>
			</form>
		</main>
	)
}
