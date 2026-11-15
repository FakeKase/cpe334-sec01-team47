import { expect, test } from "@playwright/test"

import { apiAs, dayFromToday, logIn } from "./helpers"

const PURPOSE = "E2E TEST-41"

type Request = { id: string; purpose: string }

test.beforeEach(async ({ request }) => {
	// Clear what an earlier, interrupted run left behind, then add one PENDING request from Borrower 1.
	const custodian = await apiAs(request, "CUSTODIAN")
	for (const r of await custodian.get<Request[]>("/requests?status=PENDING"))
		if (r.purpose.startsWith(PURPOSE)) await custodian.post(`/requests/${r.id}/reject`, { reason: "E2E cleanup" })

	const borrower = await apiAs(request, "BORROWER")
	const [item] = (await borrower.get<{ id: string; assetTag: string }[]>("/items")).filter(
		(i) => i.assetTag === "CPE-0202"
	)
	const res = await borrower.post("/requests", {
		itemId: item!.id,
		startDate: dayFromToday(20),
		dueDate: dayFromToday(21),
		purpose: PURPOSE,
	})
	expect(res.status()).toBe(201)
})

test("TEST-41 (AC-35): reject needs a reason, the row leaves the queue, a Borrower is not allowed", async ({
	page,
}) => {
	await logIn(page, "CUSTODIAN")
	await expect(page).toHaveURL(/\/requests$/)

	const row = page.getByRole("listitem").filter({ hasText: `Purpose: ${PURPOSE}` })
	await row.getByRole("button", { name: "Reject" }).click()

	const dialog = page.getByRole("dialog", { name: "Reject request" })
	const reason = dialog.getByLabel("Reason (required)")
	const confirm = dialog.getByRole("button", { name: "Confirm" })
	await expect(reason).toBeFocused()
	await expect(confirm).toBeDisabled()
	await reason.fill("   ")
	await expect(confirm).toBeDisabled()

	await reason.fill("Reserved for the Signals lab exam that week.")
	await confirm.click()

	await expect(page.getByText("Request rejected")).toBeVisible()
	await expect(dialog).toBeHidden()
	await expect(row).toHaveCount(0)

	await page.getByRole("button", { name: "Log out" }).click()
	await logIn(page, "BORROWER")
	await page.goto("/requests")
	await expect(page.getByRole("heading", { name: "You are not allowed to do this" })).toBeVisible()
})

test("Esc closes the reject dialog without rejecting", async ({ page }) => {
	await logIn(page, "CUSTODIAN")
	const row = page.getByRole("listitem").filter({ hasText: `Purpose: ${PURPOSE}` })
	await row.getByRole("button", { name: "Reject" }).click()
	await page.getByLabel("Reason (required)").fill("Not sent")

	await page.keyboard.press("Escape")

	await expect(page.getByRole("dialog")).toBeHidden()
	await expect(row).toHaveCount(1)
})
