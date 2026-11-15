import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute } from "../../../../../lib/negotiations/api/utils"
import { NegotiationError } from "../../../../../lib/negotiations/messages"
import { resetDemo } from "../../../../../lib/negotiations/server/demo"
import { resolveNegotiations } from "../../../../../lib/negotiations/server/runtime"
import { requireEnabled } from "../../../../../lib/negotiations/server/threads"

/** `POST /admin/negotiations/demo/reset`: "Restore demo data". Only in demo mode; real threads are not touched. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireEnabled(req.scope)
  if (!(await resolveNegotiations(req.scope).getOptions()).demo) throw new NegotiationError("demo_thread")
  await resetDemo(req.scope)
  res.json({ ok: true })
})
