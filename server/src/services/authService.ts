import type { PrismaClient, Role } from "@prisma/client"

import type { Clock } from "../clock"
import { AppError, unauthenticated } from "../errors"
import { DUMMY_HASH, hashToken, newToken, verifyPassword } from "../security"

export type AuthUser = { id: string; email: string; displayName: string; role: Role }

const toAuthUser = ({ id, email, displayName, role }: AuthUser): AuthUser => ({ id, email, displayName, role })

export function authService({
	prisma,
	clock,
	sessionTtlHours,
}: {
	prisma: PrismaClient
	clock: Clock
	sessionTtlHours: number
}) {
	return {
		async login(email: string, password: string) {
			const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
			// Always run bcrypt so an unknown email costs the same as a wrong password.
			const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
			if (!user || !ok) throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password.")

			const token = newToken()
			const expiresAt = new Date(clock().getTime() + sessionTtlHours * 3_600_000)
			await prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } })
			return { token, expiresAt: expiresAt.toISOString(), user: toAuthUser(user) }
		},

		/** Resolves a Bearer token to its session and user. Deletes an expired session. */
		async authenticate(authorization: string | null | undefined) {
			const match = /^Bearer (\S+)$/.exec(authorization ?? "")
			if (!match) throw unauthenticated()
			const session = await prisma.session.findUnique({
				where: { tokenHash: hashToken(match[1]) },
				include: { user: true },
			})
			if (!session) throw unauthenticated()
			if (session.expiresAt <= clock()) {
				await prisma.session.deleteMany({ where: { id: session.id } })
				throw unauthenticated()
			}
			return { sessionId: session.id, user: toAuthUser(session.user) }
		},

		async logout(sessionId: string) {
			await prisma.session.deleteMany({ where: { id: sessionId } })
		},
	}
}

export type AuthService = ReturnType<typeof authService>
