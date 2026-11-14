import { defineConfig, devices } from "@playwright/test"

// STS §1: Chromium against the running app (`docker compose up`, seeded with SEED_DEMO_REQUESTS=false).
// Point E2E_BASE_URL at another origin (for example the Vite dev server) to run against it instead.
export default defineConfig({
	testDir: "e2e",
	workers: 1, // the specs share one database
	use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173", trace: "retain-on-failure" },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
