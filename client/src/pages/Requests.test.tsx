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
	{
		pending = [ra, rb],
		all = [rejected, ra],
		approved = [],
		checkedOut = [],
	}: { pending?: unknown[]; all?: unknown[]; approved?: unknown[]; checkedOut?: unknown[] } = {}
) {
	sessionStorage.setItem("token", "t")
	const byStatus: Record<string, unknown[]> = { PENDING: pending, APPROVED: approved, CHECKED_OUT: checkedOut }
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user })),
		http.get("/api/requests", ({ request }) =>
			HttpResponse.json(byStatus[new URL(request.url).searchParams.get("status") ?? ""] ?? all)
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

describe("No cancel control for the Custodian (F-06, TEST-49, BR-13)", () => {
	it("neither the Pending tab nor the All tab offers Cancel", async () => {
		signIn(custodian, {
			all: [
				{ ...ra, id: "rd", status: "APPROVED" },
				{ ...ra, id: "re", status: "PENDING" },
			],
		})
		renderApp("/requests")

		await screen.findAllByRole("listitem")
		expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
		await userEvent.click(screen.getByRole("tab", { name: "All" }))
		await screen.findAllByRole("listitem")
		expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
	})
})

// F-07 (TEST-75 to TEST-77). The app's "today" is fixed to 15 Nov 2026, as on the server tests.
const loan = (id: string, name: string, tag: string, startDate: string, dueDate: string) => ({
	...ra,
	id,
	status: "APPROVED",
	item: { id: `i-${id}`, assetTag: tag, name },
	startDate,
	dueDate,
})
const inWindow = loan("h1", "Fluke 117 multimeter", "CPE-0202", "2026-11-15", "2026-11-20")
const dueToday = loan("h2", "Bench power supply", "CPE-0203", "2026-11-10", "2026-11-15")
const notStarted = loan("h3", "Epson portable projector", "CPE-0301", "2026-11-23", "2026-11-25")
const expired = loan("h4", "Wireless microphone set", "CPE-0302", "2026-11-10", "2026-11-12")
const out = {
	...ra,
	id: "o1",
	status: "CHECKED_OUT",
	item: { id: "i-o1", assetTag: "CPE-0001", name: "Arduino Uno R3" },
	startDate: "2026-11-10",
	dueDate: "2026-11-18",
	checkedOutBy: { id: "u2", displayName: "Custodian" },
	checkedOutAt: "2026-11-10T03:30:00.000Z", // 10:30 in Bangkok
}
const label = (name: string, tag: string) => `${name} · ${tag}`
const onFlow = (action: "checkout" | "return", handler: Handler) =>
	server.use(http.post(`/api/requests/:id/${action}`, handler))
const openTab = async (name: string) => userEvent.click(await screen.findByRole("tab", { name }))

describe("Custodian hands items over (F-07, TEST-75, TEST-76, AC-64)", () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-15T05:00:00Z") }))
	afterEach(() => vi.useRealTimers())

	it("TEST-75: Check out is enabled inside the BR-09 window and disabled with the reason outside it", async () => {
		signIn(custodian, { approved: [inWindow, dueToday, notStarted, expired] })
		renderApp("/requests")
		await openTab("Approved")

		const enabled = async (name: string, tag: string) =>
			within(await rowOf(label(name, tag))).getByRole("button", { name: "Check out" })
		expect(await enabled("Fluke 117 multimeter", "CPE-0202")).toBeEnabled()
		expect(await enabled("Bench power supply", "CPE-0203")).toBeEnabled()

		const early = await enabled("Epson portable projector", "CPE-0301")
		expect(early).toBeDisabled()
		expect(early).toHaveAccessibleDescription("Starts 23 Nov")
		const late = await enabled("Wireless microphone set", "CPE-0302")
		expect(late).toBeDisabled()
		expect(late).toHaveAccessibleDescription("Due date passed, can only be cancelled")
	})

	it("TEST-75: an empty Approved tab says there is nothing to hand over", async () => {
		signIn(custodian)
		renderApp("/requests")
		await openTab("Approved")
		expect(await screen.findByText("Nothing to hand over.")).toBeInTheDocument()
	})

	it("TEST-76: checking out disables the button while it runs, then the row leaves and a toast says so", async () => {
		signIn(custodian, { approved: [inWindow, dueToday] })
		const called: string[] = []
		onFlow("checkout", async ({ params }) => {
			called.push(params.id as string)
			await delay(50)
			return HttpResponse.json({ ...inWindow, status: "CHECKED_OUT" })
		})
		renderApp("/requests")
		await openTab("Approved")

		const row = within(await rowOf(label("Fluke 117 multimeter", "CPE-0202")))
		await userEvent.click(row.getByRole("button", { name: "Check out" }))

		expect(row.getByRole("button", { name: "Checking out…" })).toBeDisabled()
		expect(await screen.findByText("Item checked out")).toBeInTheDocument()
		expect(screen.queryByText(label("Fluke 117 multimeter", "CPE-0202"))).not.toBeInTheDocument()
		expect(screen.getAllByRole("listitem")).toHaveLength(1)
		expect(called).toEqual(["h1"])
	})

	it("TEST-76: a 409 shows its message on the row, which stays", async () => {
		signIn(custodian, { approved: [inWindow] })
		onFlow("checkout", () =>
			HttpResponse.json(
				{
					error: {
						code: "ITEM_NOT_AVAILABLE",
						message: "This item is under maintenance, so it cannot be handed over.",
					},
				},
				{ status: 409 }
			)
		)
		renderApp("/requests")
		await openTab("Approved")

		const row = within(await rowOf(label("Fluke 117 multimeter", "CPE-0202")))
		await userEvent.click(row.getByRole("button", { name: "Check out" }))

		expect(await row.findByRole("alert")).toHaveTextContent(
			"This item is under maintenance, so it cannot be handed over."
		)
		expect(row.getByRole("button", { name: "Check out" })).toBeEnabled()
		expect(screen.queryByText("Item checked out")).not.toBeInTheDocument()
	})
})

describe("Custodian takes items back (F-07, TEST-77, AC-64)", () => {
	const openReturn = async () => {
		signIn(custodian, { checkedOut: [out] })
		renderApp("/requests")
		await openTab("Checked out")
		const row = within(await rowOf(label("Arduino Uno R3", "CPE-0001")))
		expect(row.getByText("Checked out 10 Nov 2026, 10:30")).toBeInTheDocument()
		await userEvent.click(row.getByRole("button", { name: "Return" }))
		return { row, dialog: within(screen.getByRole("dialog", { name: "Return item" })) }
	}

	it("Return item stays disabled until a condition is chosen; Damaged warns, and the call sends the condition and note", async () => {
		let body: unknown
		onFlow("return", async ({ request }) => {
			body = await request.json()
			return HttpResponse.json({ ...out, status: "RETURNED" })
		})
		const { dialog } = await openReturn()
		const confirm = dialog.getByRole("button", { name: "Return item" })
		expect(confirm).toBeDisabled()
		expect(dialog.getByRole("radio", { name: "Good" })).not.toBeChecked()
		expect(dialog.getByRole("radio", { name: "Damaged" })).not.toBeChecked()
		expect(dialog.queryByText(/set to maintenance/)).not.toBeInTheDocument()

		await userEvent.click(dialog.getByRole("radio", { name: "Damaged" }))
		expect(confirm).toBeEnabled()
		expect(dialog.getByText(/The item will be set to maintenance/)).toBeInTheDocument()
		await userEvent.type(dialog.getByLabelText("Note (optional)"), "Probe tip bent")
		expect(dialog.getByText("14/500")).toBeInTheDocument()
		await userEvent.click(confirm)

		expect(await screen.findByText("Item returned and set to maintenance")).toBeInTheDocument()
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(screen.queryByText(label("Arduino Uno R3", "CPE-0001"))).not.toBeInTheDocument()
		expect(body).toEqual({ condition: "DAMAGED", note: "Probe tip bent" })
	})

	it("a Good return sends no note when it is blank, and the toast is plain", async () => {
		let body: unknown
		onFlow("return", async ({ request }) => {
			body = await request.json()
			return HttpResponse.json({ ...out, status: "RETURNED" })
		})
		const { dialog } = await openReturn()

		await userEvent.click(dialog.getByRole("radio", { name: "Good" }))
		await userEvent.type(dialog.getByLabelText("Note (optional)"), "   ")
		await userEvent.click(dialog.getByRole("button", { name: "Return item" }))

		expect(await screen.findByText("Item returned")).toBeInTheDocument()
		expect(body).toEqual({ condition: "GOOD" })
	})

	it("Cancel closes the dialog and sends nothing", async () => {
		const calls: string[] = []
		onFlow("return", ({ params }) => {
			calls.push(params.id as string)
			return HttpResponse.json(out)
		})
		const { row, dialog } = await openReturn()

		await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(row.getByRole("button", { name: "Return" })).toBeInTheDocument()
		expect(calls).toEqual([])
	})

	it("a 409 closes the dialog and shows its message on the row", async () => {
		onFlow("return", () =>
			HttpResponse.json(
				{ error: { code: "INVALID_TRANSITION", message: "Only checked-out requests can be returned." } },
				{ status: 409 }
			)
		)
		const { row, dialog } = await openReturn()

		await userEvent.click(dialog.getByRole("radio", { name: "Good" }))
		await userEvent.click(dialog.getByRole("button", { name: "Return item" }))

		expect(await row.findByRole("alert")).toHaveTextContent("Only checked-out requests can be returned.")
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
	})

	it("a network error keeps the dialog open with the error inside it", async () => {
		onFlow("return", () => HttpResponse.error())
		const { dialog } = await openReturn()

		await userEvent.click(dialog.getByRole("radio", { name: "Good" }))
		await userEvent.click(dialog.getByRole("button", { name: "Return item" }))

		expect(await dialog.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.")
		expect(screen.getByRole("dialog", { name: "Return item" })).toBeInTheDocument()
		expect(dialog.getByRole("button", { name: "Return item" })).toBeEnabled()
	})
})

// F-08 (TEST-90, TEST-91). `overdue` comes from the server; the client never works it out.
const late = {
	...out,
	id: "o2",
	item: { id: "i-o2", assetTag: "CPE-0002", name: "ESP32 DevKit" },
	dueDate: "2026-11-14",
	overdue: true,
}
const onTime = { ...out, overdue: false }

describe("Overdue label on Custodian rows (F-08, TEST-90, AC-74)", () => {
	it("the All and Checked out tabs show Overdue only on the overdue loan", async () => {
		signIn(custodian, { all: [late, onTime], checkedOut: [late, onTime] })
		renderApp("/requests")

		// The All tab shows the item name on its own line; the Checked out tab joins it with the asset tag.
		for (const [tab, name] of [
			["All", (item: string) => item],
			["Checked out", (item: string, tag: string) => label(item, tag)],
		] as const) {
			await openTab(tab)
			expect(await rowOf(name("ESP32 DevKit", "CPE-0002"))).toHaveTextContent("Overdue")
			expect(await rowOf(name("Arduino Uno R3", "CPE-0001"))).not.toHaveTextContent("Overdue")
			expect(within(screen.getByRole("tabpanel")).getAllByText("Overdue")).toHaveLength(1)
		}
	})
})

describe("Check out waits for an overdue loan on the same item (F-08, TEST-91, AC-74)", () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-15T05:00:00Z") }))
	afterEach(() => vi.useRealTimers())

	it("disables Check out with the reason when the item is still out on an overdue loan", async () => {
		const sameItem = { ...loan("h5", "ESP32 DevKit", "CPE-0002", "2026-11-15", "2026-11-17"), item: late.item }
		const otherItem = loan("h6", "Fluke 117 multimeter", "CPE-0202", "2026-11-15", "2026-11-17")
		signIn(custodian, { approved: [sameItem, otherItem], all: [late, onTime] })
		renderApp("/requests")
		await openTab("Approved")

		const button = async (name: string, tag: string) =>
			within(await rowOf(label(name, tag))).getByRole("button", { name: "Check out" })
		const blocked = await button("ESP32 DevKit", "CPE-0002")
		await waitFor(() => expect(blocked).toHaveAccessibleDescription("Item still out on an overdue loan"))
		expect(blocked).toBeDisabled()
		expect(await button("Fluke 117 multimeter", "CPE-0202")).toBeEnabled()
	})
})

// CR-01 (F-05 v0.3), TEST-147, AC-126: approving can reject overlapping pending requests.
describe("Approve reports the requests it rejected (CR-01, TEST-147, AC-126)", () => {
	async function approveWith(autoRejectedCount: number) {
		signIn(custodian)
		let lists = 0
		server.use(
			http.get("/api/requests", () => {
				lists++
				return HttpResponse.json([ra, rb])
			})
		)
		onDecision("approve", () => HttpResponse.json({ ...ra, status: "APPROVED", autoRejectedCount }))
		renderApp("/requests")

		const row = within(await rowOf("Rigol DS1054Z oscilloscope · CPE-0201"))
		await userEvent.click(row.getByRole("button", { name: "Approve" }))
		return { lists: () => lists }
	}

	it("with nothing rejected the toast is plain and the list is not reloaded", async () => {
		const { lists } = await approveWith(0)
		expect(await screen.findByText("Request approved")).toBeInTheDocument()
		expect(lists()).toBe(1)
	})

	it("with one rejected the toast says so and the Pending list reloads", async () => {
		const { lists } = await approveWith(1)
		expect(await screen.findByText("Request approved. 1 overlapping request was rejected.")).toBeInTheDocument()
		await waitFor(() => expect(lists()).toBe(2))
	})

	it("with two rejected the toast uses the plural and the list reloads", async () => {
		const { lists } = await approveWith(2)
		expect(await screen.findByText("Request approved. 2 overlapping requests were rejected.")).toBeInTheDocument()
		await waitFor(() => expect(lists()).toBe(2))
	})
})
