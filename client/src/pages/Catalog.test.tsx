import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"

import { borrower, custodian, renderApp } from "../test/render"
import { server } from "../test/server"

const measurement = { id: "c1", name: "Measurement instruments" }
const power = { id: "c2", name: "Power supplies" }

const scope = {
	id: "i1",
	assetTag: "CPE-0201",
	name: "Rigol DS1054Z oscilloscope",
	status: "ACTIVE",
	availableToday: true,
	category: measurement,
}
const booked = { ...scope, id: "i2", assetTag: "CPE-0202", name: "Fluke 87V multimeter", availableToday: false }
const broken = {
	...scope,
	id: "i3",
	assetTag: "CPE-0901",
	name: "Bench PSU",
	status: "MAINTENANCE",
	availableToday: false,
	category: power,
}

function signIn(user: typeof borrower) {
	sessionStorage.setItem("token", "t")
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user })),
		http.get("/api/categories", () => HttpResponse.json([measurement, power]))
	)
}

describe("Catalog list (F-02, AC-14)", () => {
	it("shows the loading state, then the items with their status badges", async () => {
		signIn(borrower)
		server.use(
			http.get("/api/items", async () => {
				await delay(50)
				return HttpResponse.json([scope, booked, broken])
			})
		)
		renderApp("/items")

		expect(await screen.findByText("Loading items…")).toBeInTheDocument()
		const rows = await screen.findAllByRole("listitem")
		expect(rows).toHaveLength(3)
		expect(within(rows[0]).getByText("Rigol DS1054Z oscilloscope")).toBeInTheDocument()
		expect(within(rows[0]).getByText("CPE-0201 · Measurement instruments")).toBeInTheDocument()
		expect(within(rows[0]).getByText("Available today")).toBeInTheDocument()
		expect(within(rows[1]).getByText("Booked today")).toBeInTheDocument()
		expect(within(rows[2]).getByText("Under maintenance")).toBeInTheDocument()
		expect(screen.queryByText("Loading items…")).not.toBeInTheDocument()
	})

	it("filters by category, and shows the empty message for a category with no items", async () => {
		signIn(borrower)
		const asked: (string | null)[] = []
		server.use(
			http.get("/api/items", ({ request }) => {
				const id = new URL(request.url).searchParams.get("categoryId")
				asked.push(id)
				return HttpResponse.json(id === "c2" ? [] : [scope])
			})
		)
		renderApp("/items")
		await screen.findByText("Rigol DS1054Z oscilloscope")

		const select = screen.getByLabelText("Category")
		await waitFor(() => expect(select).toBeEnabled())
		await userEvent.selectOptions(select, "Power supplies")
		expect(await screen.findByText("No items in this category.")).toBeInTheDocument()
		expect(asked).toEqual([null, "c2"])

		await userEvent.selectOptions(select, "All categories")
		expect(await screen.findByText("Rigol DS1054Z oscilloscope")).toBeInTheDocument()
		expect(asked).toEqual([null, "c2", null])
	})

	it("shows a generic error with Retry when the items call fails, and recovers", async () => {
		signIn(borrower)
		let calls = 0
		server.use(
			http.get("/api/items", () =>
				++calls === 1
					? HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "boom" } }, { status: 500 })
					: HttpResponse.json([scope])
			)
		)
		renderApp("/items")

		const alert = await screen.findByRole("alert")
		expect(alert).toHaveTextContent("Something went wrong. Please try again.")
		expect(alert).not.toHaveTextContent("boom")
		await userEvent.click(screen.getByRole("button", { name: "Retry" }))
		expect(await screen.findByText("Rigol DS1054Z oscilloscope")).toBeInTheDocument()
	})

	it("links each item to its detail page", async () => {
		signIn(borrower)
		server.use(
			http.get("/api/items", () => HttpResponse.json([scope])),
			http.get("/api/items/i1", () =>
				HttpResponse.json({ ...scope, description: "4-channel 50 MHz", location: "Cabinet B2", committedPeriods: [] })
			)
		)
		renderApp("/items")
		await userEvent.click(await screen.findByRole("link", { name: "View Rigol DS1054Z oscilloscope" }))
		expect(await screen.findByRole("heading", { name: "Rigol DS1054Z oscilloscope" })).toBeInTheDocument()
	})
})

describe("Item detail (F-02)", () => {
	const detail = (over = {}) => ({
		...scope,
		description: "4-channel 50 MHz",
		location: "Cabinet B2",
		committedPeriods: [
			{ startDate: "2026-11-20", dueDate: "2026-11-22", status: "APPROVED", borrower: { displayName: "Borrower Two" } },
		],
		...over,
	})

	it("shows details and booked periods, with the borrower name for a Custodian", async () => {
		signIn(custodian)
		server.use(http.get("/api/items/i1", () => HttpResponse.json(detail())))
		renderApp("/items/i1")

		expect(await screen.findByRole("heading", { name: "Rigol DS1054Z oscilloscope" })).toBeInTheDocument()
		expect(screen.getByText("Cabinet B2")).toBeInTheDocument()
		expect(screen.getByText("4-channel 50 MHz")).toBeInTheDocument()
		expect(screen.getByText(/2026-11-20 – 2026-11-22/)).toHaveTextContent("Borrower Two")
		expect(screen.queryByRole("heading", { name: "Request this item" })).not.toBeInTheDocument()
	})

	it("shows 'No upcoming bookings.' when there are none, and no borrower name for a Borrower", async () => {
		signIn(borrower)
		server.use(
			http.get("/api/items/i1", () =>
				HttpResponse.json(
					detail({ committedPeriods: [{ startDate: "2026-11-20", dueDate: "2026-11-22", status: "APPROVED" }] })
				)
			),
			http.get("/api/items/i2", () => HttpResponse.json(detail({ id: "i2", committedPeriods: [] })))
		)
		const view = renderApp("/items/i1")
		expect(await screen.findByText(/2026-11-20 – 2026-11-22/)).not.toHaveTextContent("Borrower Two")
		view.unmount()

		renderApp("/items/i2")
		expect(await screen.findByText("No upcoming bookings.")).toBeInTheDocument()
	})

	it("disables the request form with the maintenance message for a MAINTENANCE item (TEST-16)", async () => {
		signIn(borrower)
		server.use(http.get("/api/items/i3", () => HttpResponse.json(detail({ ...broken, committedPeriods: [] }))))
		renderApp("/items/i3")

		expect(await screen.findByText("Under maintenance")).toBeInTheDocument()
		expect(screen.getByText("This item is under maintenance and cannot be requested.")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Submit request" })).toBeDisabled()
	})

	it("shows the 404 page for an unknown item", async () => {
		signIn(borrower)
		server.use(
			http.get("/api/items/nope", () =>
				HttpResponse.json({ error: { code: "NOT_FOUND", message: "Item not found." } }, { status: 404 })
			)
		)
		renderApp("/items/nope")
		expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument()
	})
})
