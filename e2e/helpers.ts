import { type APIRequestContext, expect, type Page } from "@playwright/test"

// Seeded accounts. The passwords default to the docker-compose values; set the same env vars the seed used.
export const users = {
	CUSTODIAN: { email: "custodian@example.test", password: process.env.ADMIN_PASSWORD ?? "AdminInitial123!" },
	BORROWER: { email: "borrower1@example.test", password: process.env.DEMO_USER_PASSWORD ?? "DemoInitial123!" },
}
type Who = keyof typeof users

export async function logIn(page: Page, who: Who) {
	await page.goto("/login")
	await page.getByLabel("Email").fill(users[who].email)
	await page.getByLabel("Password").fill(users[who].password)
	await page.getByRole("button", { name: "Log in" }).click()
	await expect(page).not.toHaveURL(/\/login/)
}

/** Fixture setup through the real API; returns a client that sends the user's Bearer token. */
export async function apiAs(request: APIRequestContext, who: Who) {
	const res = await request.post("/api/auth/login", { data: users[who] })
	expect(res.ok()).toBe(true)
	const headers = { Authorization: `Bearer ${(await res.json()).token}` }
	return {
		get: async <T>(path: string): Promise<T> => (await request.get(`/api${path}`, { headers })).json(),
		post: (path: string, data?: unknown) => request.post(`/api${path}`, { headers, data }),
	}
}

/** YYYY-MM-DD `days` from today in the app's time zone. */
export function dayFromToday(days: number, timeZone = process.env.APP_TIMEZONE ?? "Asia/Bangkok") {
	const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date())}T00:00:00Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}
