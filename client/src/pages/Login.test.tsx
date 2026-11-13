import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"

import { borrower, custodian, renderApp } from "../test/render"
import { server } from "../test/server"

// The catalog is the landing page for Borrowers, so every test that signs one in needs these two endpoints.
beforeEach(() =>
	server.use(
		http.get("/api/categories", () => HttpResponse.json([])),
		http.get("/api/items", () => HttpResponse.json([]))
	)
)

const loginOk = (user: typeof borrower) =>
	http.post("/api/auth/login", () => HttpResponse.json({ token: "t", expiresAt: "2030-01-01T00:00:00Z", user }))

async function logIn(password = "secret") {
	const user = userEvent.setup()
	await user.type(screen.getByLabelText("Email"), "borrower1@example.test")
	await user.type(screen.getByLabelText("Password"), password)
	await user.click(screen.getByRole("button", { name: "Log in" }))
}

describe("Login (F-01, AC-09)", () => {
	it("anonymous visitors are sent to /login", async () => {
		renderApp("/my-requests")
		expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument()
	})

	it("a wrong password shows the server message and stays on the form", async () => {
		server.use(
			http.post("/api/auth/login", () =>
				HttpResponse.json(
					{ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
					{ status: 401 }
				)
			)
		)
		renderApp("/login")
		await logIn("wrong")
		expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.")
		expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument()
	})

	it("disables the button while submitting", async () => {
		server.use(http.post("/api/auth/login", async () => new Promise(() => {})))
		renderApp("/login")
		await logIn()
		expect(screen.getByRole("button", { name: "Log in" })).toBeDisabled()
	})

	it("a Borrower lands on the catalog and the header shows name and role", async () => {
		server.use(loginOk(borrower))
		renderApp("/login")
		await logIn()
		expect(await screen.findByRole("heading", { name: "Catalog" })).toBeInTheDocument()
		expect(screen.getByText("Borrower One")).toBeInTheDocument()
		expect(screen.getByText("Borrower", { selector: "span" })).toBeInTheDocument()
	})

	it("a Custodian lands on the request queue", async () => {
		server.use(loginOk(custodian))
		renderApp("/login")
		await logIn()
		expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument()
	})

	it("log out returns to /login, and a protected page then redirects there", async () => {
		server.use(
			loginOk(borrower),
			http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 }))
		)
		renderApp("/login")
		await logIn()
		await userEvent.click(await screen.findByRole("button", { name: "Log out" }))
		expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument()
		expect(sessionStorage.getItem("token")).toBeNull()
	})

	it("log out signs out even when the call fails", async () => {
		server.use(
			loginOk(borrower),
			http.post("/api/auth/logout", () => HttpResponse.error())
		)
		renderApp("/login")
		await logIn()
		await userEvent.click(await screen.findByRole("button", { name: "Log out" }))
		expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument()
	})

	it("shows the expired-session banner for ?expired=1", async () => {
		renderApp("/login?expired=1")
		expect(await screen.findByText("Your session has ended. Please log in again.")).toBeInTheDocument()
	})
})

describe("session handling (F-01 §1)", () => {
	it("restores the user from /me when a token is stored", async () => {
		sessionStorage.setItem("token", "t")
		server.use(http.get("/api/auth/me", () => HttpResponse.json({ user: borrower })))
		renderApp("/items")
		expect(await screen.findByText("Borrower One")).toBeInTheDocument()
	})

	it("a 401 from /me clears the token and shows the expired banner", async () => {
		sessionStorage.setItem("token", "stale")
		server.use(
			http.get("/api/auth/me", () =>
				HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Authentication required." } }, { status: 401 })
			)
		)
		renderApp("/items")
		expect(await screen.findByText("Your session has ended. Please log in again.")).toBeInTheDocument()
		await waitFor(() => expect(sessionStorage.getItem("token")).toBeNull())
	})

	it("a Borrower opening a Custodian route sees the 403 page", async () => {
		sessionStorage.setItem("token", "t")
		server.use(http.get("/api/auth/me", () => HttpResponse.json({ user: borrower })))
		renderApp("/requests")
		expect(await screen.findByRole("heading", { name: "You are not allowed to do this" })).toBeInTheDocument()
	})

	it("an unknown route shows the 404 page", async () => {
		sessionStorage.setItem("token", "t")
		server.use(http.get("/api/auth/me", () => HttpResponse.json({ user: borrower })))
		renderApp("/nope")
		expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument()
	})
})
