import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import type { AdminRefreshQuery } from "../../../../lib/stripe/api/validators"
import { demoChecks } from "../../../../lib/stripe/demo"
import { runChecks } from "../../../../lib/stripe/server/checks"
import { resolveStripe } from "../../../../lib/stripe/server/runtime"

/**
 * `GET /admin/stripe/checks`: every configuration check with its verdict.
 * Works without a key too (the key check then fails), so the page can show
 * what to set up.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { refresh } = req.validatedQuery as unknown as AdminRefreshQuery
  const service = resolveStripe(req.scope)
  if (service.isDemo()) {
    res.json({ demo: true, ...demoChecks() })
    return
  }
  res.json({ demo: false, ...(await runChecks(req.scope, service.reader(), { fresh: refresh })) })
}
