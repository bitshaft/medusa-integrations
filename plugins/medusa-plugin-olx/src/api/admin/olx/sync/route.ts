import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { runSync } from "../../../../lib/olx/engine"
import { buildEngine } from "../../../../lib/olx/runtime"

/** `POST /admin/olx/sync` — "Sync now": the same round the job runs every 5 minutes. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.json({ summary: await runSync(await buildEngine(req.scope)) })
}
