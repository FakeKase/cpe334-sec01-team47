import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"

import { api, setUnauthorizedHandler, tokenStore } from "../api/client"

export type Role = "BORROWER" | "CUSTODIAN"
export type User = { id: string; email: string; displayName: string; role: Role }

type Auth = {
	/** `undefined` while the stored token is being checked, `null` when signed out. */
	user: User | null | undefined
	/** True after a 401 ended the session, so the redirect to /login can show the expired banner. */
	sessionEnded: boolean
	login: (email: string, password: string) => Promise<User>
	logout: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

/** After login, Borrowers land on the catalog and Custodians on the request queue (F-01 §1 step 4). */
export const homeFor = (role: Role) => (role === "CUSTODIAN" ? "/requests" : "/items")

export function AuthProvider({ children }: { children: ReactNode }) {
	const navigate = useNavigate()
	const [user, setUser] = useState<User | null | undefined>(tokenStore.get() ? undefined : null)
	const [sessionEnded, setSessionEnded] = useState(false)

	useEffect(() => {
		setUnauthorizedHandler(() => {
			setSessionEnded(true)
			setUser(null)
		})
	}, [])

	useEffect(() => {
		if (user !== undefined) return
		api<{ user: User }>("/auth/me")
			.then((res) => setUser(res.user))
			.catch(() => setUser(null)) // a 401 here has already cleared the token and marked the session ended
	}, [user])

	const login = useCallback(async (email: string, password: string) => {
		const res = await api<{ token: string; user: User }>("/auth/login", {
			method: "POST",
			body: { email, password },
			skip401: true,
		})
		tokenStore.set(res.token)
		setSessionEnded(false)
		setUser(res.user)
		return res.user
	}, [])

	const logout = useCallback(async () => {
		try {
			await api("/auth/logout", { method: "POST", skip401: true })
		} catch {
			// The client signs out even if the call fails (F-01 §1 step 6).
		}
		tokenStore.clear()
		setUser(null)
		navigate("/login", { replace: true })
	}, [navigate])

	const value = useMemo(() => ({ user, sessionEnded, login, logout }), [user, sessionEnded, login, logout])
	return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
	return ctx
}
