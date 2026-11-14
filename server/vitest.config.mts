import { readFileSync } from "node:fs"

import { defineConfig } from "vitest/config"

// Load the test environment before vitest forks its workers. `process.loadEnvFile` is missing on older Bun
// versions (for example 1.3.13), so the file is parsed here. A variable that is already set wins, as with
// `loadEnvFile`, so a CI job or a developer can point DATABASE_URL at another test database.
for (const line of readFileSync("test/.env.test", "utf8").split(/\r?\n/)) {
	const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
	if (m) process.env[m[1]!] ??= m[2]!.replace(/^(["'])(.*)\1$/, "$2")
}

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		globalSetup: ["test/globalSetup.ts"],
		fileParallelism: false, // API tests share one database
	},
})
