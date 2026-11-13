import { useState } from "react"
import { NavLink } from "react-router"

import { type Role, useAuth } from "../auth/AuthContext"
import { buttonClass } from "./states"
import { ThemeToggle } from "./ThemeToggle"

const links: Record<Role, { to: string; label: string }[]> = {
	BORROWER: [
		{ to: "/items", label: "Catalog" },
		{ to: "/my-requests", label: "My requests" },
	],
	CUSTODIAN: [
		{ to: "/requests", label: "Requests" },
		{ to: "/items", label: "Catalog" },
	],
}

export function Header() {
	const { user, logout } = useAuth()
	const [open, setOpen] = useState(false)
	if (!user) return null

	return (
		<header className="border-b border-line bg-surface">
			<div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
				<span className="text-lg font-semibold">YeumPeunMa</span>
				<button
					type="button"
					className={`${buttonClass("secondary")} ml-auto md:hidden`}
					aria-expanded={open}
					aria-controls="main-menu"
					onClick={() => setOpen(!open)}>
					Menu
				</button>
				<div
					id="main-menu"
					className={`${open ? "flex" : "hidden"} w-full flex-col gap-3 md:flex md:w-auto md:flex-1 md:flex-row md:items-center md:gap-6`}>
					<nav aria-label="Main" className="flex flex-col gap-1 md:flex-row md:gap-4">
						{links[user.role].map((l) => (
							<NavLink
								key={l.to}
								to={l.to}
								onClick={() => setOpen(false)}
								className={({ isActive }) =>
									`min-h-11 content-center rounded-lg px-2 ${isActive ? "font-semibold underline underline-offset-8" : "text-muted"}`
								}>
								{l.label}
							</NavLink>
						))}
					</nav>
					<div className="flex items-center gap-3 md:ml-auto">
						<span>{user.displayName}</span>
						<span className="rounded-full border border-line-strong px-2 py-0.5 text-sm">
							{user.role === "CUSTODIAN" ? "Custodian" : "Borrower"}
						</span>
						<button type="button" className={buttonClass("secondary")} onClick={logout}>
							Log out
						</button>
						<ThemeToggle />
					</div>
				</div>
			</div>
		</header>
	)
}
