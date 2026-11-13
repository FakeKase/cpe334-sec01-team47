import { z } from "zod"

const schema = z.object({
	DATABASE_URL: z.string().min(1),
	PORT: z.coerce.number().int().positive().default(3000),
	APP_TIMEZONE: z.string().default("Asia/Bangkok"),
})

export function loadConfig(env: Record<string, string | undefined> = process.env) {
	const parsed = schema.safeParse(env)
	if (!parsed.success) {
		// Name the variables only: values may be secrets (NFR-06).
		const names = parsed.error.issues.map((i) => i.path.join("."))
		throw new Error(`Invalid or missing environment variables: ${names.join(", ")}`)
	}
	return parsed.data
}
