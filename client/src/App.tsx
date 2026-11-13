import { Navigate, Outlet, Route, Routes } from "react-router"

import { homeFor, useAuth } from "./auth/AuthContext"
import { RequireAuth, RequireRole } from "./auth/guards"
import { Header } from "./components/Header"
import { Login } from "./pages/Login"
import { Placeholder } from "./pages/Placeholder"
import { NotFound } from "./pages/SystemPages"

function Layout() {
	return (
		<>
			<Header />
			<main className="mx-auto max-w-5xl px-4 py-6">
				<Outlet />
			</main>
		</>
	)
}

function Home() {
	const { user } = useAuth()
	return <Navigate to={user ? homeFor(user.role) : "/login"} replace />
}

export function App() {
	return (
		<Routes>
			<Route path="/login" element={<Login />} />
			<Route element={<RequireAuth />}>
				<Route element={<Layout />}>
					<Route index element={<Home />} />
					<Route path="/items" element={<Placeholder title="Catalog" />} />
					<Route path="/items/:id" element={<Placeholder title="Item detail" />} />
					<Route element={<RequireRole allow="BORROWER" />}>
						<Route path="/my-requests" element={<Placeholder title="My requests" />} />
					</Route>
					<Route element={<RequireRole allow="CUSTODIAN" />}>
						<Route path="/requests" element={<Placeholder title="Requests" />} />
					</Route>
					<Route path="*" element={<NotFound />} />
				</Route>
			</Route>
			<Route path="*" element={<Navigate to="/login" replace />} />
		</Routes>
	)
}
