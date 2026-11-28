import { expect, test } from "@playwright/test"

import { apiAs, dayFromToday, logIn, users } from "./helpers"

// CR-01 (F-05 v0.3), TEST-148, AC-127. A random start day far ahead keeps reruns apart: the approved booking is cancelled
// again at the end, but a rejected request stays in the history.
const OFFSET = 100 + Math.floor(Math.random() * 800)
const PURPOSE = `E2E TEST-148 ${OFFSET}`
const REASON = "Item booked by another request."

type Request = { id: string; purpose: string; status: string }

test("TEST-148 (AC-127): approving one request rejects the overlapping one, and its Borrower sees the reason", async ({
	page,
	request,
}) => {
	const borrower1 = await apiAs(request, "BORROWER")
	const item = (await borrower1.get<{ id: string; assetTag: string }[]>("/items")).find(
		(i) => i.assetTag === "CPE-0302"
	)!
	// Borrower 2 has no helper account in e2e/helpers.ts, so log in the same way as apiAs does.
	const login = await request.post("/api/auth/login", {
		data: { email: "borrower2@example.test", password: users.BORROWER.password },
	})
	expect(login.ok()).toBe(true)
	const token2 = (await login.json()).token as string
	const asBorrower2 = { Authorization: `Bearer ${token2}` }

	const first = await borrower1.post("/requests", {
		itemId: item.id,
		startDate: dayFromToday(OFFSET),
		dueDate: dayFromToday(OFFSET + 2),
		purpose: `${PURPOSE} first`,
	})
	expect(first.status()).toBe(201)
	const second = await request.post("/api/requests", {
		headers: asBorrower2,
		data: {
			itemId: item.id,
			startDate: dayFromToday(OFFSET + 1),
			dueDate: dayFromToday(OFFSET + 3),
			purpose: `${PURPOSE} second`,
		},
	})
	expect(second.status()).toBe(201)
	const [firstId, secondId] = [(await first.json()).id as string, (await second.json()).id as string]

	try {
		await logIn(page, "CUSTODIAN")
		await expect(page).toHaveURL(/\/requests$/)
		const row = page.getByRole("listitem").filter({ hasText: `Purpose: ${PURPOSE} first` })
		await row.getByRole("button", { name: "Approve" }).click()
		await expect(page.getByText("Request approved. 1 overlapping request was rejected.")).toBeVisible()
		await expect(page.getByRole("listitem").filter({ hasText: `Purpose: ${PURPOSE} second` })).toHaveCount(0)

		// Borrower 2 reads the result through the API with their own token (their password is the demo password).
		const mine = await request.get("/api/requests", { headers: asBorrower2 })
		const rejected = ((await mine.json()) as (Request & { rejectionReason: string | null })[]).find(
			(r) => r.id === secondId
		)!
		expect(rejected.status).toBe("REJECTED")
		expect(rejected.rejectionReason).toBe(REASON)
	} finally {
		// Cancel the approved booking so the item and the Borrower's active slots are free for the next run.
		await borrower1.post(`/requests/${firstId}/cancel`)
	}
})
