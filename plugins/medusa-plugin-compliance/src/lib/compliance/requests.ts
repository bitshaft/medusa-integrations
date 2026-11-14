import { createHash, randomBytes } from "node:crypto"

import { addDays, DAY_MS } from "./format"
import type { RequestStatus, RequestType } from "./types"

/** A random confirmation token for the e-mail link; only its hash is stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** IP addresses are kept only as a salted hash, for the rate limit. */
export function hashIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** The answer is due `responseDays` after the request was verified. */
export function deadlineFor(verifiedAt: Date, responseDays: number): Date {
  return addDays(verifiedAt, responseDays)
}

/** Whole days left until the deadline (negative when overdue), counted from `now`. */
export function daysLeft(deadline: Date, now: Date): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS)
}

export function isDueSoon(deadline: Date | null, now: Date, warnDays: number): boolean {
  if (!deadline) return false
  return daysLeft(deadline, now) <= warnDays
}

export const OPEN_STATUSES: RequestStatus[] = ["open", "accepted"]

/** Which admin actions each status allows. Final states allow only notes. */
const ALLOWED: Record<RequestStatus, Array<"accept" | "reject" | "complete" | "export" | "anonymize" | "note">> = {
  unverified: ["reject", "note"],
  open: ["accept", "reject", "note", "export"],
  accepted: ["complete", "reject", "note", "export", "anonymize"],
  completed: ["note", "export"],
  rejected: ["note"],
  expired: ["note"],
}

export type AdminAction = "accept" | "reject" | "complete" | "export" | "anonymize" | "note"

export function canDo(status: RequestStatus, action: AdminAction, type: RequestType): boolean {
  if (!ALLOWED[status].includes(action)) return false
  if (action === "anonymize") return type === "erasure"
  if (action === "export") return type === "access" || type === "portability"
  return true
}

/** Status after an admin action, or the same status when it does not change it. */
export function nextStatus(status: RequestStatus, action: AdminAction): RequestStatus {
  if (action === "accept") return "accepted"
  if (action === "reject") return "rejected"
  if (action === "complete") return "completed"
  return status
}

/**
 * The rate limit for new requests: at most `perEmail` from one address and
 * `perIp` from one IP within the window. Returns minutes to wait, or 0.
 */
export function rateLimitWait(
  recent: Array<{ created_at: Date; email: string | null; ip_hash: string | null }>,
  subject: { email: string | null; ip_hash: string | null },
  limits: { per_email: number; per_ip: number; window_minutes: number },
  now: Date
): number {
  const windowStart = now.getTime() - limits.window_minutes * 60_000
  const inWindow = recent.filter((r) => r.created_at.getTime() > windowStart)
  const check = (rows: typeof inWindow, max: number) => {
    if (rows.length < max) return 0
    const oldest = Math.min(...rows.map((r) => r.created_at.getTime()))
    return Math.max(1, Math.ceil((oldest + limits.window_minutes * 60_000 - now.getTime()) / 60_000))
  }
  const byEmail = subject.email ? inWindow.filter((r) => r.email === subject.email) : []
  const byIp = subject.ip_hash ? inWindow.filter((r) => r.ip_hash === subject.ip_hash) : []
  return Math.max(check(byEmail, limits.per_email), check(byIp, limits.per_ip))
}

/** Rectification is handled by editing the account; the request is only recorded. */
export const RECORD_ONLY: RequestType[] = ["rectification"]
