import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"

import { custodian, renderApp } from "../test/render"
import { server } from "../test/server"

const measurement = { id: "c1", name: "Measurement instruments" }
const power = { id: "c2", name: "Power supplies" }

const item = {
	id: "i1",
	assetTag: "CPE-0201",
	name: "Rigol DS1054Z oscilloscope",
	description: "4-channel 50 MHz",
	location: "Cabinet B2",
	status: "ACTIVE",
	availableToday: true,
	category: measurement,
	committedPeriods: [],
}

const BR12 = "Asset tag must look like CPE-0042: 2 to 5 letters, a hyphen and 3 to 5 digits."

function signIn(current = item) {
	sessionStorage.setItem("token", "t")
	server.use(
		http.get("/api/auth/me", () => HttpResponse.json({ user: custodian })),
		http.get("/api/categories", () => HttpResponse.json([measurement, power])),
		http.get("/api/items", () => HttpResponse.json([current])),
		http.get("/api/items/:id", () => HttpResponse.json(current))
	)
}

async function fillNewItem(assetTag: string) {
	const tag = await screen.findByLabelText("Asset tag")
	await userEvent.clear(tag)
	await userEvent.type(tag, assetTag)
	await userEvent.type(screen.getByLabelText("Name"), "Soldering station")
	const category = screen.getByLabelText("Category")
	await waitFor(() => expect(category).toBeEnabled())
	await userEvent.selectOptions(category, "Power supplies")
	await userEvent.type(screen.getByLabelText("Location"), "Cabinet A1")
}

describe("Add and edit item form (F-09, TEST-61, AC-52)", () => {
	it("checks BR-12 before sending, shows a duplicate under Asset tag, then creates and returns to the list", async () => {
		signIn()
		const posted: unknown[] = []
		server.use(
			http.post("/api/items", async ({ request }) => {
				posted.push(await request.json())
				if (posted.length === 1)
					return HttpResponse.json(
						{
							error: {
								code: "DUPLICATE_ASSET_TAG",
								message: "This asset tag is already in use.",
								details: [{ field: "assetTag", message: "This asset tag is already in use." }],
							},
						},
						{ status: 409 }
					)
				return HttpResponse.json({ ...item, id: "i9", assetTag: "CPE-0500" }, { status: 201 })
			})
		)
		renderApp("/manage/items/new")

		expect(await screen.findByRole("heading", { name: "Add item" })).toBeInTheDocument()
		await fillNewItem("CPE42")
		await userEvent.click(screen.getByRole("button", { name: "Add item" }))
		expect(screen.getByLabelText("Asset tag")).toHaveAccessibleDescription(BR12)
		expect(posted).toHaveLength(0)

		await userEvent.clear(screen.getByLabelText("Asset tag"))
		await userEvent.type(screen.getByLabelText("Asset tag"), "cpe-0201")
		await userEvent.click(screen.getByRole("button", { name: "Add item" }))
		await waitFor(() =>
			expect(screen.getByLabelText("Asset tag")).toHaveAccessibleDescription("This asset tag is already in use.")
		)
		expect(screen.getByLabelText("Asset tag")).toHaveValue("cpe-0201")
		expect(screen.getByLabelText("Name")).toHaveValue("Soldering station")
		expect(posted[0]).toEqual({
			assetTag: "CPE-0201",
			name: "Soldering station",
			categoryId: "c2",
			location: "Cabinet A1",
			description: "",
		})

		await userEvent.clear(screen.getByLabelText("Asset tag"))
		await userEvent.type(screen.getByLabelText("Asset tag"), "CPE-0500")
		await userEvent.click(screen.getByRole("button", { name: "Add item" }))

		expect(await screen.findByRole("heading", { name: "Inventory" })).toBeInTheDocument()
		expect(screen.getByText("Item created")).toBeInTheDocument()
		expect(posted).toHaveLength(2)
	})

	it("requires a name and a category", async () => {
		signIn()
		renderApp("/manage/items/new")
		await userEvent.type(await screen.findByLabelText("Asset tag"), "CPE-0500")
		await userEvent.click(screen.getByRole("button", { name: "Add item" }))
		expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Name is required.")
		expect(screen.getByLabelText("Category")).toHaveAccessibleDescription("Choose a category.")
	})

	it("prefills the edit form and saves the changes with PATCH", async () => {
		signIn()
		const patched: unknown[] = []
		server.use(
			http.patch("/api/items/:id", async ({ request }) => {
				const body = (await request.json()) as object
				patched.push(body)
				await delay(30)
				return HttpResponse.json({ ...item, ...body })
			})
		)
		renderApp("/manage/items/i1")

		expect(await screen.findByRole("heading", { name: "Edit item" })).toBeInTheDocument()
		const name = await screen.findByLabelText("Name")
		expect(name).toHaveValue("Rigol DS1054Z oscilloscope")
		expect(screen.getByLabelText("Asset tag")).toHaveValue("CPE-0201")
		await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("c1"))
		expect(screen.getByLabelText("Location")).toHaveValue("Cabinet B2")
		expect(screen.getByLabelText("Description")).toHaveValue("4-channel 50 MHz")

		await userEvent.clear(name)
		await userEvent.type(name, "Rigol DS1104Z")
		const save = screen.getByRole("button", { name: "Save changes" })
		await userEvent.click(save)
		expect(save).toBeDisabled()

		expect(await screen.findByText("Changes saved")).toBeInTheDocument()
		expect(patched).toEqual([
			{
				assetTag: "CPE-0201",
				name: "Rigol DS1104Z",
				categoryId: "c1",
				location: "Cabinet B2",
				description: "4-channel 50 MHz",
			},
		])
	})

	it("shows Not found for an unknown item", async () => {
		signIn()
		server.use(
			http.get("/api/items/:id", () =>
				HttpResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 })
			)
		)
		renderApp("/manage/items/nope")
		expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument()
	})
})

describe("Item status section (F-09, TEST-62, AC-53)", () => {
	const statusSection = () => screen.getByRole("region", { name: "Status" })

	function onStatus(handler: (status: string) => Response | Promise<Response>) {
		const sent: string[] = []
		server.use(
			http.post("/api/items/:id/status", async ({ request }) => {
				const { status } = (await request.json()) as { status: string }
				sent.push(status)
				return handler(status)
			})
		)
		return sent
	}

	it("sets the item to maintenance", async () => {
		signIn()
		const sent = onStatus((status) => HttpResponse.json({ ...item, status, availableToday: false }))
		renderApp("/manage/items/i1")

		await screen.findByRole("heading", { name: "Edit item" })
		expect(within(statusSection()).getByText("Active")).toBeInTheDocument()
		await userEvent.click(within(statusSection()).getByRole("button", { name: "Set to maintenance" }))

		expect(await screen.findByText("Item set to maintenance")).toBeInTheDocument()
		expect(within(statusSection()).getByText("Under maintenance")).toBeInTheDocument()
		expect(within(statusSection()).getByRole("button", { name: "Set active" })).toBeInTheDocument()
		expect(sent).toEqual(["MAINTENANCE"])
	})

	it("retire: Keep item sends nothing; confirming retires and locks the form", async () => {
		signIn()
		const sent = onStatus((status) => HttpResponse.json({ ...item, status, availableToday: false }))
		renderApp("/manage/items/i1")
		await screen.findByRole("heading", { name: "Edit item" })

		await userEvent.click(within(statusSection()).getByRole("button", { name: "Retire item" }))
		let dialog = screen.getByRole("dialog", { name: "Retire item" })
		expect(dialog).toHaveTextContent("Rigol DS1054Z oscilloscope")
		expect(dialog).toHaveTextContent('Pending requests for this item will be rejected with the reason "Item retired".')
		await userEvent.click(within(dialog).getByRole("button", { name: "Keep item" }))
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(sent).toEqual([])

		await userEvent.click(within(statusSection()).getByRole("button", { name: "Retire item" }))
		dialog = screen.getByRole("dialog", { name: "Retire item" })
		await userEvent.click(within(dialog).getByRole("button", { name: "Retire item" }))

		expect(await screen.findByText("Item retired")).toBeInTheDocument()
		expect(sent).toEqual(["RETIRED"])
		expect(within(statusSection()).getByText("Retired")).toBeInTheDocument()
		expect(within(statusSection()).getByText("Retired items cannot be changed.")).toBeInTheDocument()
		expect(within(statusSection()).queryByRole("button")).not.toBeInTheDocument()
		expect(screen.getByLabelText("Name")).toBeDisabled()
		expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
	})

	it("shows the ITEM_IN_USE message in the status section", async () => {
		signIn()
		const message = "This item has approved or checked-out loans, so it cannot be retired."
		onStatus(() => HttpResponse.json({ error: { code: "ITEM_IN_USE", message } }, { status: 409 }))
		renderApp("/manage/items/i1")
		await screen.findByRole("heading", { name: "Edit item" })

		await userEvent.click(within(statusSection()).getByRole("button", { name: "Retire item" }))
		const dialog = screen.getByRole("dialog", { name: "Retire item" })
		await userEvent.click(within(dialog).getByRole("button", { name: "Retire item" }))

		expect(await within(statusSection()).findByRole("alert")).toHaveTextContent(message)
		expect(within(statusSection()).getByText("Active")).toBeInTheDocument()
	})

	it("a retired item opens read-only", async () => {
		signIn({ ...item, status: "RETIRED", availableToday: false })
		renderApp("/manage/items/i1")
		await screen.findByRole("heading", { name: "Edit item" })
		await waitFor(() => expect(screen.getByLabelText("Name")).toBeDisabled())
		expect(within(statusSection()).getByText("Retired items cannot be changed.")).toBeInTheDocument()
	})
})
