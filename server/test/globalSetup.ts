import { execSync } from "node:child_process"

// Migrate the test database once per run (STS §1).
export default function setup() {
	if (!process.env.DATABASE_URL?.includes("_test")) throw new Error("Refusing to migrate a non-test database.")
	execSync("npx prisma migrate deploy", { stdio: "inherit" })
}
