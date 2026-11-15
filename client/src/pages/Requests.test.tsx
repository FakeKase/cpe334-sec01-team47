import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"

import { borrower, custodian, renderApp } from "../test/render"
import { server } from "../test/server"

const ra = {
	id: "ra",
	status: "PENDING",
	item: { id: "i1", assetTag: "CPE-0201", name: "Rigol DS1054Z oscilloscope" },
	borrower: { id: "u1", displayName: "Borrower One" },
	startDate: "2026-11-20",
	dueDate: "2026-11-22",
	purpose: "Signals lab experiment 4",
	rejectionReason: null,
	decidedBy: null,
	decidedAt: null,
	createdAt: "2026-11-12T07:05:00.000Z", // 14:05 in Bangkok
}
const rb = {
	...ra,
	id: "rb",
	item: { id: "i2", assetTag: "CPE-0101", name: "Raspberry Pi 5 kit" },
	borrower: { id: "u3", displayName: "Borrower Two" },
	purpose: "IoT mini project demo",
}
const rejected = { ...rb, id: "rc", status: "REJECTED", rejectionReason: "Exam week" }

type Handler = Parameters<typeof http.post>[1]

function signIn(
	user: typeof borrower | typeof custodian,
	{ pending = [ra, rb], all = [rejected, ra] }: { pending?: unknown[]; all?: unknown[] } = {}
) {
	sessionStorage.setItem("token", "t")
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user })),
		http.get("/api/requests", ({ request }) =>
			HttpResponse.json(new URL(request.url).searchParams.get("status") === "PENDING" ? pending : all)
		)
	)
}

const onDecision = (action: "approve" | "reject", handler: Handler) =>
	server.use(http.post(`/api/requests/:id/${action}`, handler))

const rowOf = async (name: string) => (await screen.findByText(name)).closest("li")!

describe("Custodian requests (F-05, AC-35)", () => {
	it("shows the pending queue with borrower, item, purpose, period and submitted time", async () => {
		signIn(custodian)
		renderApp("/requests")

		expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument()
		expect(screen.getByRole("tab", { name: "Pending" })).toHaveAttribute("aria-selected", "true")
		const rows = await screen.findAllByRole("listitem")
		expect(rows).toHaveLength(2)
		const first = within(rows[0])
		expect(first.getByText("Borrower One")).toBeInTheDocument()
		expect(first.getByText("Rigol DS1054Z oscilloscope · CPE-0201")).toBeInTheDocument()
		expect(first.getByText("Purpose: Signals lab experiment 4")).toBeInTheDocument()
		expect(first.getByText("20 Nov – 22 Nov 2026")).toBeInTheDocument()
		expect(first.getByText("Submitted 12 Nov 2026, 14:05")).toBeInTheDocument()
		expect(within(rows[1]).getByText("Borrower Two")).toBeInTheDocument()
	})

	it("approve: both buttons are disabled while it runs, then the row leaves and a toast says so", async () => {
		signIn(custodian)
		const called: string[] = []
		onDecision("approve", async ({ params }) => {
			called.push(params.id as string)
			await delay(50)
			return HttpResponse.json({ ...ra, status: "APPROVED" })
		})
		renderApp("/requests")

		const row = within(await rowOf("Rigol DS1054Z oscilloscope · CPE-0201"))
		await userEvent.click(row.getByRole("button", { name: "Approve" }))

		expect(row.getByRole("button", { name: "Approving…" })).toBeDisabled()
		expect(row.getByRole("button", { name: "Reject" })).toBeDisabled()
		expect(await screen.findByText("Request approved")).toBeInTheDocument()
		expect(screen.queryByText("Rigol DS1054Z oscilloscope · CPE-0201")).not.toBeInTheDocument()
		expect(screen.getAllByRole("listitem")).toHaveLength(1)
		expect(called).toEqual(["ra"])
	})

	it("a 409 shows its message on the row, which stays and can be tried again", async () => {
		signIn(custodian)
		onDecision("approve", () =>
			HttpResponse.json(
				{ error: { code: "PERIOD_UNAVAILABLE", message: "This item is already booked for part of that period." } },
				{ status: 409 }
			)
		)
		renderApp("/requests")

		const row = within(await rowOf("Rigol DS1054Z oscilloscope · CPE-0201"))
		await userEvent.click(row.getByRole("button", { name: "Approve" }))

		expect(await row.findByRole("alert")).toHaveTextContent("This item is already booked for part of that period.")
		expect(row.getByRole("button", { name: "Approve" })).toBeEnabled()
		expect(screen.getAllByRole("listitem")).toHaveLength(2)
		expect(screen.queryByText("Request approved")).not.toBeInTheDocument()
	})

	it("reject (TEST-41): Confirm stays disabled until a non-blank reason; confirming removes the row with a toast", async () => {
		signIn(custodian)
		let body: unknown
		onDecision("reject", async ({ request }) => {
			body = await request.json()
			return HttpResponse.json({ ...ra, status: "REJECTED" })
		})
		renderApp("/requests")

		const row = within(await rowOf("Rigol DS1054Z oscilloscope · CPE-0201"))
		await userEvent.click(row.getByRole("button", { name: "Reject" }))

		const dialog = within(screen.getByRole("dialog", { name: "Reject request" }))
		const reason = dialog.getByLabelText("Reason (required)")
		const confirm = dialog.getByRole("button", { name: "Confirm" })
		expect(reason).toHaveFocus()
		expect(dialog.getByText("0/500")).toBeInTheDocument()
		expect(confirm).toBeDisabled()

		await userEvent.type(reason, "   ")
		expect(confirm).toBeDisabled()

		await userEvent.clear(reason)
		await userEvent.type(reason, "Exam week")
		expect(dialog.getByText("9/500")).toBeInTheDocument()
		await userEvent.click(confirm)

		expect(await screen.findByText("Request rejected")).toBeInTheDocument()
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(screen.queryByText("Rigol DS1054Z oscilloscope · CPE-0201")).not.toBeInTheDocument()
		expect(body).toEqual({ reason: "Exam week" })
	})

	it("Cancel closes the dialog without rejecting", async () => {
		signIn(custodian)
		const called = vi.fn()
		onDecision("reject", () => {
			called()
			return HttpResponse.json({})
		})
		renderApp("/requests")

		const row = within(await rowOf("Rigol DS1054Z oscilloscope · CPE-0201"))
		await userEvent.click(row.getByRole("button", { name: "Reject" }))
		await userEvent.type(screen.getByLabelText("Reason (required)"), "Exam week")
		await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(screen.getAllByRole("listitem")).toHaveLength(2)
		expect(called).not.toHaveBeenCalled()
	})

	it("the reason is capped at 500 characters", async () => {
		signIn(custodian)
		renderApp("/requests")

		const row = within(await rowOf("Rigol DS1054Z oscilloscope · CPE-0201"))
		await userEvent.click(row.getByRole("button", { name: "Reject" }))
		expect(screen.getByLabelText("Reason (required)")).toHaveAttribute("maxlength", "500")
	})

	it("an empty queue says so", async () => {
		signIn(custodian, { pending: [] })
		renderApp("/requests")

		expect(await screen.findByText("No pending requests.")).toBeInTheDocument()
		expect(screen.getByText("New borrow requests will appear here.")).toBeInTheDocument()
	})

	it("the All tab lists every request with its status badge, borrower and rejection reason", async () => {
		signIn(custodian)
		renderApp("/requests")
		await screen.findAllByRole("listitem")

		await userEvent.click(screen.getByRole("tab", { name: "All" }))

		expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true")
		await waitFor(() => expect(screen.getByText("Rejected")).toBeInTheDocument())
		const rows = screen.getAllByRole("listitem")
		expect(within(rows[0]).getByText("CPE-0101 · Borrower Two")).toBeInTheDocument()
		expect(within(rows[0]).getByText("Reason: Exam week")).toBeInTheDocument()
		expect(within(rows[1]).getByText("Pending")).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
	})

	it("shows the error state on a server error, and Retry reloads", async () => {
		signIn(custodian)
		let calls = 0
		server.use(
			http.get("/api/requests", () =>
				++calls === 1
					? HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "x" } }, { status: 500 })
					: HttpResponse.json([ra])
			)
		)
		renderApp("/requests")

		await userEvent.click(await screen.findByRole("button", { name: "Retry" }))
		expect(await screen.findByText("Borrower One")).toBeInTheDocument()
	})

	it("a Borrower opening /requests sees the not-allowed page and no Requests link", async () => {
		signIn(borrower)
		renderApp("/requests")

		expect(await screen.findByText("You are not allowed to do this")).toBeInTheDocument()
		expect(screen.queryByRole("link", { name: "Requests" })).not.toBeInTheDocument()
	})
})
