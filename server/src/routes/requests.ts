import { Elysia } from "elysia"
import { z } from "zod"

import { requireAuth, requireRole } from "../middleware/auth"
import type { AuthService } from "../services/authService"
import type { RequestService } from "../services/requestService"

// Unknown keys such as borrowerId or status are stripped (F-03 contract §2 case 9).
const newRequestBody = z.object({
	itemId: z.string().uuid(),
	startDate: z.iso.date(),
	dueDate: z.iso.date(),
	purpose: z.string().trim().min(1, "Purpose is required.").max(300, "Purpose can be at most 300 characters."),
})

export const requestRoutes = (auth: AuthService, requests: RequestService) =>
	new Elysia().use(requireAuth(auth)).post(
		"/requests",
		async ({ body, user, set }) => {
			set.status = 201
			return requests.create(user.id, body)
		},
		{ body: newRequestBody, beforeHandle: requireRole("BORROWER") }
	)
