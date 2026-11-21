import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"

import { writeView } from "../../../../lib/olx/api/utils"
import type { AdminPublish } from "../../../../lib/olx/api/validators"
import { publishAdvert } from "../../../../lib/olx/engine"
import { buildEngine } from "../../../../lib/olx/runtime"

/** `POST /admin/olx/publish` — publishes one variant. Every outcome is described in `result`. */
export async function POST(req: MedusaRequest<z.infer<typeof AdminPublish>>, res: MedusaResponse) {
  const engine = await buildEngine(req.scope)
  res.json(writeView(await publishAdvert(engine, req.validatedBody)))
}
