import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { describeForStore, RateLimiter, resolveEnabled } from "../../../../lib/whitelist-vat/api/utils"
import type { StoreVerifyBody } from "../../../../lib/whitelist-vat/api/validators"
import { verifyAndEmit } from "../../../../lib/whitelist-vat/records"

const limiter = new RateLimiter()

/**
 * `POST /store/whitelist-vat/verify` — for the checkout's company form:
 * checks a NIP or EU VAT number and returns the verdict with the company's
 * name and address to fill in.
 *
 * `could_not_verify: true` means the registers were down; the storefront
 * should let the customer continue. Lookups are limited per visitor so
 * nobody can use up the store's daily white list quota.
 */
export async function POST(req: MedusaRequest<StoreVerifyBody>, res: MedusaResponse) {
  const { options } = await resolveEnabled(req)
  if (!options.store.enabled) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Tax ID verification is not available in this store")
  }
  if (!limiter.allow(req.ip ?? "unknown", options.store.rateLimitPerMinute)) {
    res.setHeader("Retry-After", "60")
    res.status(429).json({ type: "rate_limit", message: "Too many verifications. Try again in a minute." })
    return
  }

  const { number, country_code } = req.validatedBody
  const verification = await verifyAndEmit(req.scope, { number, country_code, trigger: "checkout" })
  res.json({ verification: describeForStore(verification) })
}
