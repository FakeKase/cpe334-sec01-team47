import { expect, test } from "@playwright/test"

import { logIn } from "./helpers"

// F-10 has no delete, so every run leaves its category behind. A unique name per run keeps reruns apart.
const stamp = Date.now()
const ADDED = `E2E cat ${stamp}`
const RENAMED = `E2E ren ${stamp}`

test("TEST-101 (AC-83): a Custodian adds and renames a category, and the catalog filter shows the new name", async ({
	page,
}) => {
	await logIn(page, "CUSTODIAN")
	await page.getByRole("link", { name: "Categories", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible()

	await page.getByLabel("Name", { exact: true }).fill(ADDED)
	await page.getByRole("button", { name: "Add category" }).click()
	await expect(page.getByText("Category added")).toBeVisible()
	const row = page.getByRole("listitem").filter({ hasText: ADDED })
	await expect(row).toBeVisible()

	await row.getByRole("button", { name: `Rename ${ADDED}` }).click()
	await page.getByLabel("Category name").fill(RENAMED)
	await page.getByRole("button", { name: "Save" }).click()
	await expect(page.getByText("Category renamed")).toBeVisible()
	await expect(page.getByRole("listitem").filter({ hasText: RENAMED })).toBeVisible()
	await expect(page.getByRole("listitem").filter({ hasText: ADDED })).toHaveCount(0)

	await page.goto("/items")
	const filter = page.getByLabel("Category")
	await expect(filter.getByRole("option", { name: RENAMED })).toHaveCount(1)
	await expect(filter.getByRole("option", { name: ADDED })).toHaveCount(0)
})
