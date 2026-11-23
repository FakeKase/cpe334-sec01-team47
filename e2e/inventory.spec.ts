import { expect, test } from "@playwright/test"

import { logIn } from "./helpers"

test("TEST-64 (AC-43, AC-48, AC-52, AC-53): a Custodian adds, edits and retires an item", async ({ page }) => {
	// Retired items stay in the database, so every run needs a fresh tag.
	const tag = `TST-${String(Date.now() % 100_000).padStart(5, "0")}`
	const name = `E2E soldering station ${tag}`

	await logIn(page, "CUSTODIAN")
	await page.getByRole("link", { name: "Inventory" }).click()
	await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible()

	await page.getByRole("link", { name: "Add item" }).click()
	await page.getByLabel("Asset tag").fill(tag.toLowerCase())
	await page.getByLabel("Name").fill(name)
	await page.getByLabel("Category").selectOption({ label: "Measurement instruments" })
	await page.getByLabel("Location").fill("Cabinet A1")
	await page.getByRole("button", { name: "Add item" }).click()

	await expect(page.getByText("Item created")).toBeVisible()
	const row = page.getByRole("listitem").filter({ hasText: name })
	await expect(row).toContainText(`${tag} · Measurement instruments`)
	await row.getByRole("link", { name: `Edit ${name}` }).click()

	const status = page.getByRole("region", { name: "Status" })
	await status.getByRole("button", { name: "Set to maintenance" }).click()
	await expect(page.getByText("Item set to maintenance")).toBeVisible()
	await expect(status.getByText("Under maintenance")).toBeVisible()

	await status.getByRole("button", { name: "Retire item" }).click()
	const dialog = page.getByRole("dialog", { name: "Retire item" })
	await expect(dialog).toContainText('rejected with the reason "Item retired"')
	await dialog.getByRole("button", { name: "Retire item" }).click()
	await expect(page.getByText("Item retired", { exact: true })).toBeVisible()
	await expect(page.getByLabel("Name")).toBeDisabled()

	await page.getByRole("link", { name: "Inventory" }).click()
	await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Retired")

	await page.getByRole("button", { name: "Log out" }).click()
	await logIn(page, "BORROWER")
	await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible()
	await expect(page.getByText("Arduino Uno R3").first()).toBeVisible()
	await expect(page.getByText(name)).toHaveCount(0)
})
