import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"

import { borrower, custodian, renderApp } from "../test/render"
import { server } from "../test/server"

const measurement = { id: "c1", name: "Measurement instruments" }
const scope = {
	id: "i1",
	assetTag: "CPE-0201",
	name: "Rigol DS1054Z oscilloscope",
	status: "ACTIVE",
	availableToday: true,
	category: measurement,
}
const retired = {
	...scope,
	id: "i2",
	assetTag: "CPE-0999",
	name: "Old CRT oscilloscope",
	status: "RETIRED",
	availableToday: false,
}
const detail = { ...scope, description: null, location: null, committedPeriods: [] }

function signIn(user: typeof borrower, items: unknown[] = [scope, retired]) {
	sessionStorage.setItem("token", "t")
	const asked: string[] = []
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user })),
		http.get("/api/categories", () => HttpResponse.json([measurement])),
		http.get("/api/items", async ({ request }) => {
			asked.push(new URL(request.url).search)
			await delay(30)
			return HttpResponse.json(items)
		}),
		http.get("/api/items/:id", () => HttpResponse.json(detail))
	)
	return asked
}

describe("Inventory navigation (F-09, TEST-63, AC-54)", () => {
	it("a Custodian sees Inventory in the header, Add item on the catalog and Edit on the item", async () => {
		signIn(custodian)
		const { unmount } = renderApp("/items")

		expect(await screen.findByRole("link", { name: "Inventory" })).toHaveAttribute("href", "/manage/items")
		expect(await screen.findByRole("link", { name: "Add item" })).toHaveAttribute("href", "/manage/items/new")
		unmount()

		renderApp("/items/i1")
		expect(await screen.findByRole("link", { name: "Edit" })).toHaveAttribute("href", "/manage/items/i1")
	})

	it("a Borrower sees none of them and is not allowed on /manage/items", async () => {
		signIn(borrower)
		const first = renderApp("/items")
		await screen.findByText("Rigol DS1054Z oscilloscope")
		expect(screen.queryByRole("link", { name: "Inventory" })).not.toBeInTheDocument()
		expect(screen.queryByRole("link", { name: "Add item" })).not.toBeInTheDocument()
		first.unmount()

		const second = renderApp("/items/i1")
		await screen.findByRole("heading", { name: "Rigol DS1054Z oscilloscope" })
		expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument()
		second.unmount()

		renderApp("/manage/items")
		expect(await screen.findByRole("heading", { name: "You are not allowed to do this" })).toBeInTheDocument()
	})
})

describe("Inventory list (F-09, TEST-63, AC-54)", () => {
	it("loads every item including retired ones, with badges and Edit links", async () => {
		const asked = signIn(custodian)
		renderApp("/manage/items")

		expect(await screen.findByRole("heading", { name: "Inventory" })).toBeInTheDocument()
		expect(screen.getByText("Loading items…")).toBeInTheDocument()
		const rows = await screen.findAllByRole("listitem")
		expect(rows).toHaveLength(2)
		expect(within(rows[0]).getByText("CPE-0201 · Measurement instruments")).toBeInTheDocument()
		expect(within(rows[0]).getByText("Available today")).toBeInTheDocument()
		expect(within(rows[1]).getByText("Retired")).toBeInTheDocument()
		expect(within(rows[1]).getByRole("link", { name: "Edit Old CRT oscilloscope" })).toHaveAttribute(
			"href",
			"/manage/items/i2"
		)
		expect(screen.getByRole("link", { name: "Add item" })).toHaveAttribute("href", "/manage/items/new")
		expect(asked).toEqual(["?includeRetired=true"])
	})

	it("shows the empty message", async () => {
		signIn(custodian, [])
		renderApp("/manage/items")
		expect(await screen.findByText("No items yet.")).toBeInTheDocument()
	})

	it("shows Retry after an error and reloads", async () => {
		signIn(custodian)
		let calls = 0
		server.use(
			http.get("/api/items", () =>
				++calls === 1
					? HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "x" } }, { status: 500 })
					: HttpResponse.json([scope])
			)
		)
		renderApp("/manage/items")

		await userEvent.click(await screen.findByRole("button", { name: "Retry" }))
		expect(await screen.findByText("Rigol DS1054Z oscilloscope")).toBeInTheDocument()
		expect(calls).toBe(2)
	})
})
