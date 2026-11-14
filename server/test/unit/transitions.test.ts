import { RequestStatus } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { canTransition } from "../../src/domain/transitions"

const BR_06 = [
	"PENDING>APPROVED",
	"PENDING>REJECTED",
	"PENDING>CANCELLED",
	"APPROVED>CHECKED_OUT",
	"APPROVED>CANCELLED",
	"CHECKED_OUT>RETURNED",
]

describe("canTransition (TEST-36, AC-32)", () => {
	const statuses = Object.values(RequestStatus)
	const pairs = statuses.flatMap((from) => statuses.map((to) => [from, to] as const))

	it("covers all 36 (from, to) pairs", () => {
		expect(pairs).toHaveLength(36)
	})

	it.each(pairs)("%s -> %s", (from, to) => {
		expect(canTransition(from, to)).toBe(BR_06.includes(`${from}>${to}`))
	})
})
