import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { App } from "../App"
import { AuthProvider } from "../auth/AuthContext"

export const borrower = { id: "u1", email: "borrower1@example.test", displayName: "Borrower One", role: "BORROWER" }
export const custodian = { id: "u2", email: "custodian@example.test", displayName: "Custodian", role: "CUSTODIAN" }

export function renderApp(path = "/") {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<AuthProvider>
				<App />
			</AuthProvider>
		</MemoryRouter>
	)
}
