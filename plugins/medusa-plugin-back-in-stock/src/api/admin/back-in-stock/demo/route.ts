import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import type { AdminSeedDemoBody } from "../../../../lib/back-in-stock/api/validators"
import { seedDemo } from "../../../../lib/back-in-stock/demo"

/**
 * `POST /admin/back-in-stock/demo` — creates sample subscriptions for the
 * given addresses on out-of-stock variants from the catalog. They are marked
 * `demo`: their emails are rendered and logged, never sent.
 */
export async function POST(req: MedusaRequest<AdminSeedDemoBody>, res: MedusaResponse) {
  await resolveEnabled(req)
  res.json(await seedDemo(req.scope, req.validatedBody))
}
