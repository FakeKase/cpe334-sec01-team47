import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		globalSetup: ["test/globalSetup.ts"],
		fileParallelism: false, // API tests share one database
	},
})
