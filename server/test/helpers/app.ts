import { createApp } from "../../src/app"
import { prisma, TEST_NOW } from "./db"

/** Starts the app on a random port with the fixed test clock. Call `stop()` in afterAll. */
export function startTestApp() {
	const app = createApp({ prisma, clock: () => TEST_NOW }).listen(0)
	return { url: app.server!.url.origin, stop: () => app.stop() }
}

export type Credentials = { email: string; password: string }

export const credentials = {
	BORROWER: { email: "borrower1@example.test", password: process.env.DEMO_USER_PASSWORD! },
	CUSTODIAN: { email: "custodian@example.test", password: process.env.ADMIN_PASSWORD! },
} satisfies Record<string, Credentials>

/** Real `POST /api/auth/login`; returns the Bearer token (STS §1). */
export async function loginAs(url: string, role: keyof typeof credentials) {
	const res = await fetch(`${url}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(credentials[role]),
	})
	return ((await res.json()) as { token: string }).token
}
