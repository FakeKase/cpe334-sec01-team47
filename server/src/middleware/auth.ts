import type { Role } from "@prisma/client"
import { Elysia } from "elysia"

import { forbidden } from "../errors"
import type { AuthService } from "../services/authService"

/** Routes registered after `.use(requireAuth(...))` get `user` and `sessionId`, or 401 UNAUTHENTICATED. */
export const requireAuth = (auth: AuthService) =>
	new Elysia({ name: "requireAuth" }).resolve({ as: "scoped" }, ({ request }) =>
		auth.authenticate(request.headers.get("authorization"))
	)

/** `beforeHandle` guard: 403 FORBIDDEN unless the user has one of `roles` (BR-13). */
export const requireRole =
	(...roles: Role[]) =>
	({ user }: { user: { role: Role } }) => {
		if (!roles.includes(user.role)) throw forbidden()
	}
