import { expect, test } from "@playwright/test"

import { apiAs, dayFromToday, logIn } from "./helpers"

const PURPOSE = "E2E TEST-50"

type Request = { id: string; purpose: string; status: string }

test.beforeEach(async ({ request }) => {
	// Cancel what an earlier, interrupted run left behind, then add one PENDING request from Borrower 1.
	const borrower = await apiAs(request, "BORROWER")
	for (const r of await borrower.get<Request[]>("/requests"))
		if (r.purpose === PURPOSE && r.status === "PENDING") await borrower.post(`/requests/${r.id}/cancel`)

	const [item] = (await borrower.get<{ id: string; assetTag: string }[]>("/items")).filter(
		(i) => i.assetTag === "CPE-0203"
	)
	const res = await borrower.post("/requests", {
		itemId: item!.id,
		startDate: dayFromToday(30),
		dueDate: dayFromToday(31),
		purpose: PURPOSE,
	})
	expect(res.status()).toBe(201)
})

test("TEST-50 (AC-42): a Borrower cancels a pending request, and it stays cancelled after a reload", async ({
	page,
}) => {
	await logIn(page, "BORROWER")
	await page.goto("/my-requests")

	// Newest first, so the first CPE-0203 row is the request this test just created.
	const row = page.getByRole("listitem").filter({ hasText: "CPE-0203" }).first()
	await row.getByRole("button", { name: "Cancel" }).click()

	const dialog = page.getByRole("dialog", { name: "Cancel request" })
	await dialog.getByRole("button", { name: "Keep request" }).click()
	await expect(dialog).toBeHidden()
	await expect(row.getByText("Pending")).toBeVisible()

	await row.getByRole("button", { name: "Cancel" }).click()
	await dialog.getByRole("button", { name: "Cancel request" }).click()

	await expect(page.getByText("Request cancelled")).toBeVisible()
	await expect(dialog).toBeHidden()
	await expect(row.getByText("Cancelled")).toBeVisible()
	await expect(row.getByRole("button", { name: "Cancel" })).toHaveCount(0)

	await page.reload()
	await expect(row.getByText("Cancelled")).toBeVisible()
})
