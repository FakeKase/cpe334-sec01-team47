import { RequestStatus } from "@prisma/client"
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

// BR-07: 1-500 characters after trimming.
const rejectBody = z.object({
	reason: z
		.string({ error: "Reason is required." })
		.trim()
		.min(1, "Reason is required.")
		.max(500, "Reason can be at most 500 characters."),
})

// Unknown keys such as borrowerId are stripped (F-04 contract §2).
const listQuery = z.object({ status: z.enum(RequestStatus).optional() })

export const requestRoutes = (auth: AuthService, requests: RequestService) =>
	new Elysia()
		.use(requireAuth(auth))
		.post(
			"/requests",
			async ({ body, user, set }) => {
				set.status = 201
				return requests.create(user.id, body)
			},
			{ body: newRequestBody, transform: requireRole("BORROWER") }
		)
		.get("/requests", ({ query, user }) => requests.list(user, query.status), { query: listQuery })
		.get("/requests/:id", ({ params, user }) => requests.get(user, params.id))
		.post("/requests/:id/approve", ({ params, user }) => requests.approve(user.id, params.id), {
			transform: requireRole("CUSTODIAN"),
		})
		.post("/requests/:id/reject", ({ params, body, user }) => requests.reject(user.id, params.id, body.reason), {
			body: rejectBody,
			transform: requireRole("CUSTODIAN"),
		})
