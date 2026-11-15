import { createHash, randomBytes } from "node:crypto"

import bcrypt from "bcryptjs"

// Cost 12 hash of a throwaway password. Compared when the email is unknown so both failures take the same time.
export const DUMMY_HASH = "$2b$12$6bZFawgh9hD202jyKymuouS2lFnbCYA1Rlh9ZoNfWsmujl.5nTUBC"

export const hashPassword = (password: string, cost = 12) => bcrypt.hash(password, cost)
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash)

/** 256 bits of randomness, URL safe. Only its hash is stored. */
export const newToken = () => randomBytes(32).toString("base64url")
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")
