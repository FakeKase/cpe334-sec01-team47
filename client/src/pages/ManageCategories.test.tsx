import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"

import { borrower, custodian, renderApp } from "../test/render"
import { server } from "../test/server"

const audio = { id: "c1", name: "Audio-visual" }
const micro = { id: "c2", name: "Microcontrollers" }

function signIn(user: typeof borrower | typeof custodian, categories: unknown[] = [micro, audio]) {
	sessionStorage.setItem("token", "t")
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user })),
		http.get("/api/categories", () => HttpResponse.json(categories))
	)
}

const duplicate = () =>
	HttpResponse.json(
		{
			error: {
				code: "DUPLICATE_CATEGORY_NAME",
				message: "A category with this name already exists.",
				details: [{ field: "name", message: "A category with this name already exists." }],
			},
		},
		{ status: 409 }
	)

const names = () => screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent)

describe("Manage categories (F-10, TEST-100, AC-82)", () => {
	it("lists the categories by name, and the Custodian has a Categories link", async () => {
		signIn(custodian)
		renderApp("/manage/categories")

		expect(await screen.findByRole("heading", { name: "Categories" })).toBeInTheDocument()
		expect(screen.getByText("Loading categories…")).toBeInTheDocument()
		await screen.findByText("Audio-visual")
		expect(names()).toEqual(["Audio-visual", "Microcontrollers"])
		expect(screen.getAllByRole("link", { name: "Categories" }).length).toBeGreaterThan(0)
	})

	it("an empty list says so", async () => {
		signIn(custodian, [])
		renderApp("/manage/categories")
		expect(await screen.findByText("No categories yet.")).toBeInTheDocument()
	})

	it("adding sends the name, shows the row in order, clears the field and shows the toast", async () => {
		signIn(custodian)
		let body: unknown
		server.use(
			http.post("/api/categories", async ({ request }) => {
				body = await request.json()
				await delay(30)
				return HttpResponse.json({ id: "c3", name: "Cables" }, { status: 201 })
			})
		)
		renderApp("/manage/categories")
		await screen.findByText("Audio-visual")

		await userEvent.type(screen.getByLabelText("Name"), "  Cables ")
		await userEvent.click(screen.getByRole("button", { name: "Add category" }))

		expect(await screen.findByRole("button", { name: "Adding…" })).toBeDisabled()
		expect(await screen.findByText("Category added")).toBeInTheDocument()
		expect(body).toEqual({ name: "  Cables " }) // the server trims
		expect(names()).toEqual(["Audio-visual", "Cables", "Microcontrollers"])
		expect(screen.getByLabelText("Name")).toHaveValue("")
	})

	it("a blank name is refused on the page without calling the API", async () => {
		signIn(custodian)
		const calls: string[] = []
		server.use(
			http.post("/api/categories", () => {
				calls.push("post")
				return HttpResponse.json({ id: "x", name: "x" }, { status: 201 })
			})
		)
		renderApp("/manage/categories")
		await screen.findByText("Audio-visual")

		await userEvent.type(screen.getByLabelText("Name"), "   ")
		await userEvent.click(screen.getByRole("button", { name: "Add category" }))

		expect(await screen.findByText("Name is required.")).toBeInTheDocument()
		expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true")
		expect(calls).toEqual([])
	})

	it("a 409 on add shows the server message under the field and keeps what was typed", async () => {
		signIn(custodian)
		server.use(http.post("/api/categories", duplicate))
		renderApp("/manage/categories")
		await screen.findByText("Audio-visual")

		await userEvent.type(screen.getByLabelText("Name"), "audio-visual")
		await userEvent.click(screen.getByRole("button", { name: "Add category" }))

		expect(await screen.findByText("A category with this name already exists.")).toBeInTheDocument()
		expect(screen.getByLabelText("Name")).toHaveValue("audio-visual")
		expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("A category with this name already exists.")
		expect(screen.queryByText("Category added")).not.toBeInTheDocument()
	})

	it("renaming edits the row in place, sends the name, and shows the new name and the toast", async () => {
		signIn(custodian)
		let sent: { id?: string; body?: unknown } = {}
		server.use(
			http.patch("/api/categories/:id", async ({ params, request }) => {
				sent = { id: params.id as string, body: await request.json() }
				return HttpResponse.json({ id: "c1", name: "Lab AV" })
			})
		)
		renderApp("/manage/categories")
		await screen.findByText("Audio-visual")

		await userEvent.click(screen.getByRole("button", { name: "Rename Audio-visual" }))
		const field = screen.getByLabelText("Category name")
		expect(field).toHaveFocus()
		expect(field).toHaveValue("Audio-visual")
		await userEvent.clear(field)
		await userEvent.type(field, "Lab AV")
		await userEvent.click(screen.getByRole("button", { name: "Save" }))

		expect(await screen.findByText("Category renamed")).toBeInTheDocument()
		expect(sent).toEqual({ id: "c1", body: { name: "Lab AV" } })
		expect(screen.queryByLabelText("Category name")).not.toBeInTheDocument()
		expect(names()).toEqual(["Lab AV", "Microcontrollers"])
	})

	it("Cancel and Esc put the old name back and send nothing", async () => {
		signIn(custodian)
		const calls: string[] = []
		server.use(
			http.patch("/api/categories/:id", () => {
				calls.push("patch")
				return HttpResponse.json(audio)
			})
		)
		renderApp("/manage/categories")
		await screen.findByText("Audio-visual")

		await userEvent.click(screen.getByRole("button", { name: "Rename Audio-visual" }))
		await userEvent.type(screen.getByLabelText("Category name"), " changed")
		await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
		expect(screen.queryByLabelText("Category name")).not.toBeInTheDocument()
		expect(names()).toEqual(["Audio-visual", "Microcontrollers"])

		await userEvent.click(screen.getByRole("button", { name: "Rename Microcontrollers" }))
		await userEvent.keyboard("{Escape}")
		expect(screen.queryByLabelText("Category name")).not.toBeInTheDocument()
		expect(calls).toEqual([])
	})

	it("a 409 on rename shows the message under the field and keeps the field open with the typed text", async () => {
		signIn(custodian)
		server.use(http.patch("/api/categories/:id", duplicate))
		renderApp("/manage/categories")
		await screen.findByText("Audio-visual")

		await userEvent.click(screen.getByRole("button", { name: "Rename Microcontrollers" }))
		const field = screen.getByLabelText("Category name")
		await userEvent.clear(field)
		await userEvent.type(field, "AUDIO-visual")
		await userEvent.click(screen.getByRole("button", { name: "Save" }))

		expect(await screen.findByText("A category with this name already exists.")).toBeInTheDocument()
		await waitFor(() => expect(screen.getByLabelText("Category name")).toHaveValue("AUDIO-visual"))
		expect(screen.queryByText("Category renamed")).not.toBeInTheDocument()
	})

	it("a Borrower sees the not-allowed page and has no Categories link", async () => {
		signIn(borrower)
		renderApp("/manage/categories")

		expect(await screen.findByText("You are not allowed to do this")).toBeInTheDocument()
		expect(screen.queryByRole("link", { name: "Categories" })).not.toBeInTheDocument()
		expect(within(document.body).queryByLabelText("Name")).not.toBeInTheDocument()
	})
})
