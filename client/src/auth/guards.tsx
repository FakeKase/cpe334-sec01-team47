import { Navigate, Outlet } from "react-router"

import { LoadingState } from "../components/states"
import { Forbidden } from "../pages/SystemPages"
import { type Role, useAuth } from "./AuthContext"

/** No signed-in user → /login (with ?expired=1 after a 401). The backend enforces access; this only routes. */
export function RequireAuth() {
	const { user, sessionEnded } = useAuth()
	if (user === undefined) return <LoadingState message="Loading…" />
	return user ? <Outlet /> : <Navigate to={sessionEnded ? "/login?expired=1" : "/login"} replace />
}

/** Wrong role → "You are not allowed to do this". Cosmetic only (F-01 §6). */
export function RequireRole({ allow }: { allow: Role }) {
	const { user } = useAuth()
	return user?.role === allow ? <Outlet /> : <Forbidden />
}
