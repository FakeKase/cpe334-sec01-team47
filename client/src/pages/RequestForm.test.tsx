import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"

import { today } from "../api/requests"
import { borrower, renderApp } from "../test/render"
import { server } from "../test/server"

const addDays = (n: number) => {
	const [y, m, d] = today().split("-").map(Number)
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const item = {
	id: "i1",
	assetTag: "CPE-0201",
	name: "Rigol DS1054Z oscilloscope",
	status: "ACTIVE",
	availableToday: true,
	category: { id: "c1", name: "Measurement instruments" },
	description: null,
	location: null,
	committedPeriods: [],
}

const created = {
	id: "r1",
	status: "PENDING",
	item: { id: "i1", assetTag: "CPE-0201", name: item.name },
	borrower: { id: "u1", displayName: "Borrower One" },
	startDate: addDays(1),
	dueDate: addDays(3),
	purpose: "Signals lab experiment 4",
	rejectionReason: null,
	decidedBy: null,
	decidedAt: null,
	createdAt: new Date().toISOString(),
}

/** Signs in as a Borrower and records every POST /api/requests body. */
function setup(post: () => Response | Promise<Response> = () => HttpResponse.json(created, { status: 201 })) {
	sessionStorage.setItem("token", "t")
	const sent: unknown[] = []
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user: borrower })),
		http.get("/api/items/i1", () => HttpResponse.json(item)),
		http.get("/api/requests", () => HttpResponse.json([created])),
		http.post("/api/requests", async ({ request }) => {
			sent.push(await request.json())
			return post()
		})
	)
	return sent
}

const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

async function fill(start: string, due: string, purpose = "Signals lab experiment 4") {
	await screen.findByLabelText("Start date")
	set("Start date", start)
	set("Due date", due)
	set("Purpose", purpose)
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Submit request" }))

describe("Request form (F-03, AC-23, TEST-27)", () => {
	it("shows a field error and sends nothing when the due date is before the start date, then shows the server's 409 and keeps the input", async () => {
		const sent = setup(() =>
			HttpResponse.json(
				{ error: { code: "PERIOD_UNAVAILABLE", message: "This item is already booked for part of that period." } },
				{ status: 409 }
			)
		)
		renderApp("/items/i1")

		await fill(addDays(3), addDays(2))
		await submit()
		expect(await screen.findByText("Due date must be on or after the start date.")).toBeInTheDocument()
		expect(sent).toHaveLength(0)

		await fill(addDays(2), addDays(4))
		await submit()
		expect(await screen.findByRole("alert")).toHaveTextContent("This item is already booked for part of that period.")
		expect(sent).toHaveLength(1)
		expect(screen.getByLabelText("Start date")).toHaveValue(addDays(2))
		expect(screen.getByLabelText("Due date")).toHaveValue(addDays(4))
		expect(screen.getByLabelText("Purpose")).toHaveValue("Signals lab experiment 4")
		expect(screen.getByRole("button", { name: "Submit request" })).toBeEnabled()
	})

	it("requires both dates and a purpose", async () => {
		const sent = setup()
		renderApp("/items/i1")
		await screen.findByLabelText("Start date")
		await submit()

		expect(screen.getByText("Start date is required.")).toBeInTheDocument()
		expect(screen.getByText("Due date is required.")).toBeInTheDocument()
		expect(screen.getByText("Purpose is required.")).toBeInTheDocument()
		expect(sent).toHaveLength(0)
	})

	it("applies BR-01: no start in the past, at most 14 days", async () => {
		const sent = setup()
		renderApp("/items/i1")

		await fill(addDays(-1), addDays(1))
		await submit()
		expect(await screen.findByText("Start date cannot be in the past.")).toBeInTheDocument()

		await fill(addDays(1), addDays(15))
		await submit()
		expect(await screen.findByText("A loan can be at most 14 days.")).toBeInTheDocument()
		expect(sent).toHaveLength(0)
	})

	it("accepts a one-day loan starting today", async () => {
		const sent = setup()
		renderApp("/items/i1")

		await fill(addDays(0), addDays(0))
		await submit()
		await screen.findByRole("heading", { name: "My requests" })
		expect(sent).toHaveLength(1)
	})

	it("accepts a 14-day period", async () => {
		const sent = setup()
		renderApp("/items/i1")
		await fill(addDays(1), addDays(14))
		await submit()
		await screen.findByRole("heading", { name: "My requests" })
		expect(sent).toHaveLength(1)
	})

	it("counts the purpose after trimming and rejects more than 300 characters", async () => {
		const sent = setup()
		renderApp("/items/i1")

		await fill(addDays(1), addDays(2), `  ${"a".repeat(300)}  `)
		expect(screen.getByText("300/300")).toBeInTheDocument()

		set("Purpose", "a".repeat(301))
		expect(screen.getByText("301/300")).toBeInTheDocument()
		await submit()
		expect(await screen.findByText("Purpose must be at most 300 characters.")).toBeInTheDocument()
		expect(sent).toHaveLength(0)
	})

	it("submits the dates and the trimmed purpose, then opens My requests with the confirmation banner showing Pending", async () => {
		const sent = setup()
		renderApp("/items/i1")

		await fill(addDays(1), addDays(3), "  Signals lab experiment 4  ")
		await submit()

		expect(await screen.findByText("Request submitted. Waiting for approval.")).toBeInTheDocument()
		expect(sent).toEqual([
			{ itemId: "i1", startDate: addDays(1), dueDate: addDays(3), purpose: "Signals lab experiment 4" },
		])
		expect(await screen.findByText("Pending")).toBeInTheDocument()
	})

	it("disables the button while the request is in flight", async () => {
		setup(() => new Promise<Response>(() => {}))
		renderApp("/items/i1")

		await fill(addDays(1), addDays(3))
		await submit()
		expect(screen.getByRole("button", { name: "Submit request" })).toBeDisabled()
	})

	it("puts server validation details under the matching fields", async () => {
		setup(() =>
			HttpResponse.json(
				{
					error: {
						code: "VALIDATION_ERROR",
						message: "Invalid request.",
						details: [{ field: "dueDate", message: "A loan can be at most 14 days." }],
					},
				},
				{ status: 400 }
			)
		)
		renderApp("/items/i1")

		await fill(addDays(1), addDays(3))
		await submit()
		expect(await screen.findByText("A loan can be at most 14 days.")).toBeInTheDocument()
		expect(screen.queryByRole("alert")).not.toBeInTheDocument()
	})

	it("shows a generic message when the network fails", async () => {
		setup(() => HttpResponse.error())
		renderApp("/items/i1")

		await fill(addDays(1), addDays(3))
		await submit()
		expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.")
	})
})
