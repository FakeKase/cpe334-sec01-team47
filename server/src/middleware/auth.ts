import type { Role } from "@prisma/client"
import { Elysia } from "elysia"

import { forbidden } from "../errors"
import type { AuthService } from "../services/authService"

/** Uses derive, not resolve: derive runs before body validation, so an anonymous request gets 401 and never a 400 that leaks field names (AC-06).
 * Routes registered after `.use(requireAuth(...))` get `user` and `sessionId`, or 401 UNAUTHENTICATED. */
export const requireAuth = (auth: AuthService) =>
	new Elysia({ name: "requireAuth" }).derive({ as: "scoped" }, ({ request }) =>
		auth.authenticate(request.headers.get("authorization"))
	)

/** `beforeHandle` guard: 403 FORBIDDEN unless the user has one of `roles` (BR-13). */
export const requireRole =
	(...roles: Role[]) =>
	({ user }: { user: { role: Role } }) => {
		if (!roles.includes(user.role)) throw forbidden()
	}
