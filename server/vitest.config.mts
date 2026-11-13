import { defineConfig } from "vitest/config"

// Load the test environment before vitest forks its workers.
process.loadEnvFile("test/.env.test")

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		globalSetup: ["test/globalSetup.ts"],
		fileParallelism: false, // API tests share one database
	},
})
