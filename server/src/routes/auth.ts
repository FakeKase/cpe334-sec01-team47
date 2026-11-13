import { Elysia } from "elysia"
import { z } from "zod"

import { requireAuth } from "../middleware/auth"
import type { AuthService } from "../services/authService"

const loginBody = z.object({
	email: z.string().trim().email(),
	password: z.string().min(1).max(200),
})

export const authRoutes = (auth: AuthService) =>
	new Elysia({ prefix: "/auth" })
		.post("/login", ({ body }) => auth.login(body.email, body.password), { body: loginBody })
		.use(requireAuth(auth))
		.get("/me", ({ user }) => ({ user }))
		.post("/logout", async ({ sessionId, set }) => {
			await auth.logout(sessionId)
			set.status = 204
		})
