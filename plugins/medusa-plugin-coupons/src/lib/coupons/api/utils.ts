import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"

import { pluginDisabledError } from "../kit/options"
import { normalizeLocale, PLUGIN_NAME } from "../options"
import { resolveCoupons } from "../server/query"
import type { Locale } from "../types"

/** The module service, or a clear "disabled" error when the options are invalid. */
export async function requireEnabled(req: MedusaRequest) {
  const service = resolveCoupons(req.scope)
  if (!(await service.isEnabled())) {
    throw pluginDisabledError(PLUGIN_NAME, (await service.disabledReason()) ?? "invalid options")
  }
  return service
}

/** The signed-in customer, or null for guests. */
export function optionalCustomerId(req: MedusaRequest): string | null {
  return (req as AuthenticatedMedusaRequest).auth_context?.actor_id ?? null
}

/** The customer's language: `locale` in the query or body, then `x-medusa-locale`, then the plugin default. */
export async function requestLocale(req: MedusaRequest, explicit?: string): Promise<Locale> {
  const { defaultLocale } = await resolveCoupons(req.scope).getOptions()
  return normalizeLocale(explicit ?? req.get("x-medusa-locale") ?? req.get("accept-language"), defaultLocale)
}

/** Validates a body inside a route, for routes whose path a middleware matcher cannot single out. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body)
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.map(String).join(".") || "body"}: ${issue.message}`)
      .join("; ")
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid request: ${message}`)
  }
  return result.data
}

export function sendCsv(res: MedusaResponse, fileName: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
  res.status(200).send(csv)
}

/** Fixed one-minute windows per key; enough to slow down guessing codes. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  allow(key: string, perMinute: number, now = Date.now()): boolean {
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 10_000) this.prune(now)
      this.hits.set(key, { count: 1, resetAt: now + 60_000 })
      return true
    }
    entry.count++
    return entry.count <= perMinute
  }

  private prune(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key)
  }
}

const limiter = new RateLimiter()

/** Limits `/store/coupons/check` per visitor (`checkRateLimitPerMinute`). */
export async function rateLimitCheck(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const service = resolveCoupons(req.scope)
  const perMinute = (await service.isEnabled()) ? (await service.getOptions()).checkRateLimitPerMinute : 20
  if (!limiter.allow(req.ip ?? "unknown", perMinute)) {
    res.setHeader("Retry-After", "60")
    res.status(429).json({ type: "rate_limit", message: "Too many coupon checks. Try again in a minute." })
    return
  }
  next()
}
