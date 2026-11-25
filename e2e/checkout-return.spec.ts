import { expect, test } from "@playwright/test"

import { apiAs, dayFromToday, logIn } from "./helpers"

const PURPOSE = "E2E TEST-79"
const TAG = "CPE-0003" // no other spec uses it, because a damaged return leaves the item under maintenance

type Request = { id: string; purpose: string; status: string }
type Item = { id: string; assetTag: string; status: string }

test.beforeEach(async ({ request }) => {
	// Undo what an earlier, interrupted run left behind: cancel its open requests and take back a loan that is out.
	const borrower = await apiAs(request, "BORROWER")
	const custodian = await apiAs(request, "CUSTODIAN")
	for (const r of await borrower.get<Request[]>("/requests")) {
		if (r.purpose !== PURPOSE) continue
		if (r.status === "PENDING" || r.status === "APPROVED") await borrower.post(`/requests/${r.id}/cancel`)
		if (r.status === "CHECKED_OUT") await custodian.post(`/requests/${r.id}/return`, { condition: "GOOD" })
	}

	const item = (await borrower.get<Item[]>("/items")).find((i) => i.assetTag === TAG)!
	// Only a custodian action in F-09 can set it back to ACTIVE, so a finished run needs a reseeded database.
	test.skip(item.status !== "ACTIVE", `${TAG} is under maintenance from an earlier run: reseed the database`)

	const created = await borrower.post("/requests", {
		itemId: item.id,
		startDate: dayFromToday(0),
		dueDate: dayFromToday(1),
		purpose: PURPOSE,
	})
	expect(created.status()).toBe(201)
	const approved = await custodian.post(`/requests/${(await created.json()).id}/approve`)
	expect(approved.status()).toBe(200)
})

test("TEST-79 (AC-65): a Custodian checks out and returns a loan as damaged, and the catalog shows the item under maintenance", async ({
	page,
}) => {
	await logIn(page, "CUSTODIAN")
	await page.goto("/requests")

	await page.getByRole("tab", { name: "Approved" }).click()
	const row = page.getByRole("listitem").filter({ hasText: `Purpose: ${PURPOSE}` })
	await row.getByRole("button", { name: "Check out" }).click()
	await expect(page.getByText("Item checked out")).toBeVisible()
	await expect(row).toHaveCount(0)

	await page.getByRole("tab", { name: "Checked out" }).click()
	await row.getByRole("button", { name: "Return" }).click()

	const dialog = page.getByRole("dialog", { name: "Return item" })
	const confirm = dialog.getByRole("button", { name: "Return item" })
	await expect(confirm).toBeDisabled()
	await dialog.getByRole("radio", { name: "Damaged" }).check()
	await expect(dialog.getByText(/will be set to maintenance/)).toBeVisible()
	await dialog.getByLabel("Note (optional)").fill("Header pins bent")
	await confirm.click()

	await expect(page.getByText("Item returned and set to maintenance")).toBeVisible()
	await expect(dialog).toBeHidden()
	await expect(row).toHaveCount(0)

	// The All tab shows plain rows without the purpose, newest first, so this run's request is the first for the item.
	await page.getByRole("tab", { name: "All" }).click()
	await expect(page.getByRole("listitem").filter({ hasText: TAG }).first().getByText("Returned")).toBeVisible()

	await page.goto("/items")
	await expect(page.getByRole("listitem").filter({ hasText: TAG }).getByText("Under maintenance")).toBeVisible()
})
