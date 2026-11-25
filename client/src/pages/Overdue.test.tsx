import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"

import { borrower, custodian, renderApp } from "../test/render"
import { server } from "../test/server"

const loan = {
	id: "o1",
	status: "CHECKED_OUT",
	item: { id: "i1", assetTag: "CPE-0201", name: "Rigol DS1054Z oscilloscope" },
	borrower: { id: "u3", displayName: "Borrower Two" },
	startDate: "2026-11-08",
	dueDate: "2026-11-12",
	purpose: "Signals lab",
	rejectionReason: null,
	decidedBy: null,
	decidedAt: null,
	cancelledAt: null,
	checkedOutBy: { id: "u2", displayName: "Custodian" },
	checkedOutAt: "2026-11-08T03:00:00.000Z",
	returnedTo: null,
	returnedAt: null,
	returnCondition: null,
	returnNote: null,
	overdue: true,
	createdAt: "2026-11-01T03:00:00.000Z",
}
const later = {
	...loan,
	id: "o2",
	item: { id: "i2", assetTag: "CPE-0002", name: "ESP32 DevKit" },
	borrower: { id: "u1", displayName: "Borrower One" },
	dueDate: "2026-11-14",
}

/** Records the query of every GET /api/requests, so the test can check the page asks for overdue loans only. */
function signIn(
	user: typeof borrower | typeof custodian,
	respond: () => Response = () => HttpResponse.json([loan, later])
) {
	sessionStorage.setItem("token", "t")
	const queries: string[] = []
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user })),
		http.get("/api/requests", ({ request }) => {
			queries.push(new URL(request.url).search)
			return respond()
		})
	)
	return queries
}

describe("Overdue loans page (F-08, TEST-92, AC-75)", () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-15T05:00:00Z") }))
	afterEach(() => vi.useRealTimers())

	it("lists the overdue loans in the server's order with borrower, item, due date and days overdue", async () => {
		const queries = signIn(custodian)
		renderApp("/overdue")

		expect(await screen.findByRole("heading", { name: "Overdue loans" })).toBeInTheDocument()
		const rows = await screen.findAllByRole("listitem")
		expect(rows).toHaveLength(2)
		const first = within(rows[0])
		expect(first.getByText("Borrower Two")).toBeInTheDocument()
		expect(first.getByText("Rigol DS1054Z oscilloscope · CPE-0201")).toBeInTheDocument()
		expect(first.getByText("Due 12 Nov 2026")).toBeInTheDocument()
		expect(first.getByText("3 days overdue")).toBeInTheDocument()
		expect(within(rows[1]).getByText("Borrower One")).toBeInTheDocument()
		expect(within(rows[1]).getByText("1 day overdue")).toBeInTheDocument()
		expect(queries).toEqual(["?overdue=true"])
		expect(screen.queryByRole("button", { name: "Return" })).not.toBeInTheDocument()
	})

	it("the Custodian's header links to it", async () => {
		signIn(custodian)
		renderApp("/requests")
		await userEvent.click(await screen.findByRole("link", { name: "Overdue" }))
		expect(await screen.findByRole("heading", { name: "Overdue loans" })).toBeInTheDocument()
	})

	it("says so when nothing is overdue", async () => {
		signIn(custodian, () => HttpResponse.json([]))
		renderApp("/overdue")
		expect(await screen.findByText("No overdue loans.")).toBeInTheDocument()
	})

	it("shows the error state on a server error, and Retry reloads", async () => {
		let fail = true
		signIn(custodian, () =>
			fail
				? HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "x" } }, { status: 500 })
				: HttpResponse.json([loan])
		)
		renderApp("/overdue")

		const retry = await screen.findByRole("button", { name: "Retry" })
		fail = false
		await userEvent.click(retry)
		expect(await screen.findByText("Borrower Two")).toBeInTheDocument()
	})

	it("a Borrower has no Overdue link and gets the not-allowed page", async () => {
		signIn(borrower)
		renderApp("/overdue")
		expect(await screen.findByText("You are not allowed to do this")).toBeInTheDocument()
		expect(screen.queryByRole("link", { name: "Overdue" })).not.toBeInTheDocument()
	})
})
