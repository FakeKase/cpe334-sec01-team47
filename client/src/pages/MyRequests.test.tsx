import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"
import { createMemoryRouter, RouterProvider } from "react-router"

import { App } from "../App"
import { AuthProvider } from "../auth/AuthContext"
import { borrower, renderApp } from "../test/render"
import { server } from "../test/server"

const pending = {
	id: "r1",
	status: "PENDING",
	item: { id: "i1", assetTag: "CPE-0201", name: "Rigol DS1054Z oscilloscope" },
	borrower: { id: "u1", displayName: "Borrower One" },
	startDate: "2026-11-20",
	dueDate: "2026-11-22",
	purpose: "Signals lab experiment 4",
	rejectionReason: null,
	decidedBy: null,
	decidedAt: null,
	createdAt: "2026-11-15T05:00:00.000Z",
}
const rejected = {
	...pending,
	id: "r2",
	status: "REJECTED",
	item: { id: "i2", assetTag: "CPE-0202", name: "Fluke 87V multimeter" },
	startDate: "2026-12-30",
	dueDate: "2027-01-02",
	rejectionReason: "Exam week",
	decidedBy: { id: "u2", displayName: "Custodian" },
	decidedAt: "2026-11-16T05:00:00.000Z",
}
const approved = { ...pending, id: "r3", status: "APPROVED" }

function signIn(requests: unknown[] | (() => Promise<Response>)) {
	sessionStorage.setItem("token", "t")
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user: borrower })),
		http.get("/api/requests", typeof requests === "function" ? requests : () => HttpResponse.json(requests))
	)
}

describe("My requests (F-04, TEST-30, AC-26)", () => {
	it("shows the loading state, then one row per request with its period, submitted date and status", async () => {
		signIn(async () => {
			await delay(50)
			return HttpResponse.json([pending, approved])
		})
		renderApp("/my-requests")

		expect(await screen.findByText("Loading your requests…")).toBeInTheDocument()
		expect(screen.getByText("Track your borrow requests and their status.")).toBeInTheDocument()
		const rows = await screen.findAllByRole("listitem")
		expect(rows).toHaveLength(2)
		expect(within(rows[0]).getByText("Rigol DS1054Z oscilloscope")).toBeInTheDocument()
		expect(within(rows[0]).getByText("CPE-0201")).toBeInTheDocument()
		expect(within(rows[0]).getByText("20 Nov – 22 Nov 2026")).toBeInTheDocument()
		expect(within(rows[0]).getByText("Submitted 15 Nov 2026")).toBeInTheDocument()
		expect(within(rows[0]).getByText("Pending")).toBeInTheDocument()
		expect(within(rows[1]).getByText("Approved")).toBeInTheDocument()
		expect(screen.queryByText(/^Reason:/)).not.toBeInTheDocument()
	})

	it("(a) a Borrower with no requests sees the empty message and a link to the catalog", async () => {
		signIn([])
		renderApp("/my-requests")

		expect(await screen.findByText("You have no requests yet.")).toBeInTheDocument()
		expect(screen.getByText("Browse the catalog and request equipment for the dates you need.")).toBeInTheDocument()
		expect(screen.getByRole("link", { name: "Go to the catalog" })).toHaveAttribute("href", "/items")
	})

	it("(b) a rejected request shows the Rejected badge and the reason", async () => {
		signIn([rejected])
		renderApp("/my-requests")

		const row = await screen.findByRole("listitem")
		expect(within(row).getByText("Rejected")).toBeInTheDocument()
		expect(within(row).getByText("Reason: Exam week")).toBeInTheDocument()
		expect(within(row).getByText("30 Dec 2026 – 2 Jan 2027")).toBeInTheDocument()
	})

	it("shows the confirmation banner after F-03 redirects here", async () => {
		signIn([pending])
		renderApp({ pathname: "/my-requests", state: { submitted: true } })

		expect(await screen.findByText("Request submitted. Waiting for approval.")).toBeInTheDocument()
	})

	it("clears the banner flag from history, so Back or a reload does not show it again", async () => {
		signIn([pending])
		const router = createMemoryRouter(
			[
				{
					path: "*",
					element: (
						<AuthProvider>
							<App />
						</AuthProvider>
					),
				},
			],
			{ initialEntries: [{ pathname: "/my-requests", state: { submitted: true } }] }
		)
		server.use(
			http.get("/api/items", () => HttpResponse.json([])),
			http.get("/api/categories", () => HttpResponse.json([]))
		)
		render(<RouterProvider router={router} />)

		expect(await screen.findByText("Request submitted. Waiting for approval.")).toBeInTheDocument()
		await waitFor(() => expect(router.state.location.state).toBeNull())
		expect(screen.getByText("Request submitted. Waiting for approval.")).toBeInTheDocument()

		await act(() => router.navigate("/items"))
		await act(() => router.navigate(-1))
		await screen.findByRole("listitem")
		expect(screen.queryByText("Request submitted. Waiting for approval.")).not.toBeInTheDocument()
	})

	it("shows no banner on a normal visit", async () => {
		signIn([pending])
		renderApp("/my-requests")

		await screen.findByRole("listitem")
		expect(screen.queryByText("Request submitted. Waiting for approval.")).not.toBeInTheDocument()
	})

	it("shows the error state on a server error, and Retry reloads", async () => {
		let calls = 0
		signIn(async () =>
			++calls === 1
				? HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "x" } }, { status: 500 })
				: HttpResponse.json([pending])
		)
		renderApp("/my-requests")

		await userEvent.click(await screen.findByRole("button", { name: "Retry" }))
		expect(await screen.findByText("Rigol DS1054Z oscilloscope")).toBeInTheDocument()
	})
})

const withStatus = (id: string, status: string, name: string) => ({
	...pending,
	id,
	status,
	item: { id: `i-${id}`, assetTag: "CPE-0300", name },
})
const oneOfEach = [
	withStatus("s1", "PENDING", "Item pending"),
	withStatus("s2", "APPROVED", "Item approved"),
	withStatus("s3", "REJECTED", "Item rejected"),
	withStatus("s4", "CANCELLED", "Item cancelled"),
	withStatus("s5", "CHECKED_OUT", "Item checked out"),
	withStatus("s6", "RETURNED", "Item returned"),
]
const rowFor = async (name: string) => within((await screen.findByText(name)).closest("li")!)
const cancelled = { ...pending, status: "CANCELLED", cancelledAt: "2026-11-15T06:00:00.000Z" }

describe("Cancel a request (F-06, TEST-48, TEST-49, AC-42)", () => {
	it("TEST-48: Cancel is offered on PENDING and APPROVED rows only", async () => {
		signIn(oneOfEach)
		renderApp("/my-requests")

		await screen.findByText("Item pending")
		const withButton = [] as string[]
		for (const name of oneOfEach.map((r) => r.item.name)) {
			if ((await rowFor(name)).queryByRole("button", { name: "Cancel" })) withButton.push(name)
		}
		expect(withButton).toEqual(["Item pending", "Item approved"])
	})

	it("TEST-49: Keep request closes the dialog and sends nothing", async () => {
		signIn([pending])
		const calls: string[] = []
		server.use(
			http.post("/api/requests/:id/cancel", ({ params }) => {
				calls.push(params.id as string)
				return HttpResponse.json(cancelled)
			})
		)
		renderApp("/my-requests")

		const row = await rowFor("Rigol DS1054Z oscilloscope")
		await userEvent.click(row.getByRole("button", { name: "Cancel" }))
		const dialog = await screen.findByRole("dialog", { name: "Cancel request" })
		expect(within(dialog).getByText(/Rigol DS1054Z oscilloscope/)).toBeInTheDocument()
		await userEvent.click(within(dialog).getByRole("button", { name: "Keep request" }))

		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
		expect(calls).toEqual([])
		expect(row.getByText("Pending")).toBeInTheDocument()
		expect(row.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
	})

	it("TEST-49: confirming posts once, disables both buttons meanwhile, then shows Cancelled, no button and a toast", async () => {
		signIn([pending])
		const calls: string[] = []
		server.use(
			http.post("/api/requests/:id/cancel", async ({ params }) => {
				calls.push(params.id as string)
				await delay(50)
				return HttpResponse.json(cancelled)
			})
		)
		renderApp("/my-requests")

		const row = await rowFor("Rigol DS1054Z oscilloscope")
		await userEvent.click(row.getByRole("button", { name: "Cancel" }))
		const dialog = within(await screen.findByRole("dialog", { name: "Cancel request" }))
		await userEvent.click(dialog.getByRole("button", { name: "Cancel request" }))

		expect(dialog.getByRole("button", { name: "Cancelling…" })).toBeDisabled()
		expect(dialog.getByRole("button", { name: "Keep request" })).toBeDisabled()
		expect(await screen.findByText("Request cancelled")).toBeInTheDocument()
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(row.getByText("Cancelled")).toBeInTheDocument()
		expect(row.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument()
		expect(calls).toEqual(["r1"])
	})

	it("TEST-49: a 409 shows its message on the row, closes the dialog and reloads the list", async () => {
		let loads = 0
		signIn(async () => HttpResponse.json(++loads === 1 ? [approved] : [{ ...approved, status: "CHECKED_OUT" }]))
		server.use(
			http.post("/api/requests/:id/cancel", () =>
				HttpResponse.json(
					{
						error: { code: "INVALID_TRANSITION", message: "Only pending or approved requests can be cancelled." },
					},
					{ status: 409 }
				)
			)
		)
		renderApp("/my-requests")

		const row = await rowFor("Rigol DS1054Z oscilloscope")
		await userEvent.click(row.getByRole("button", { name: "Cancel" }))
		const dialog = within(await screen.findByRole("dialog", { name: "Cancel request" }))
		await userEvent.click(dialog.getByRole("button", { name: "Cancel request" }))

		expect(await screen.findByRole("alert")).toHaveTextContent("Only pending or approved requests can be cancelled.")
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(screen.queryByText("Request cancelled")).not.toBeInTheDocument()
		await waitFor(() => expect(loads).toBe(2))
		expect(await screen.findByText("Checked out")).toBeInTheDocument()
	})
})
