import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { App } from "../App"
import { AuthProvider } from "../auth/AuthContext"

export const borrower = { id: "u1", email: "borrower1@example.test", displayName: "Borrower One", role: "BORROWER" }
export const custodian = { id: "u2", email: "custodian@example.test", displayName: "Custodian", role: "CUSTODIAN" }

/** `path` can carry router state, e.g. `{ pathname: "/my-requests", state: { submitted: true } }`. */
export function renderApp(path: string | { pathname: string; state: unknown } = "/") {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<AuthProvider>
				<App />
			</AuthProvider>
		</MemoryRouter>
	)
}
