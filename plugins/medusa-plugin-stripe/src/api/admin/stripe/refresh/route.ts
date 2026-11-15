import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveStripe } from "../../../../lib/stripe/server/runtime"

/** `POST /admin/stripe/refresh`: forgets cached Stripe answers; the next page view reads Stripe again. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.json({ cleared: resolveStripe(req.scope).invalidate() })
}
