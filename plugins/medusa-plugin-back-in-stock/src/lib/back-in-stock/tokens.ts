import { createHash, randomBytes } from "node:crypto"

/** A link token: 32 random bytes, URL-safe. Only its hash is ever stored. */
export function createToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Tokens are 43 URL-safe characters; anything else is rejected before a lookup. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)
}
