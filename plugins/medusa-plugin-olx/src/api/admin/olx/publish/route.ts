import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"

import { writeView } from "../../../../lib/olx/api/utils"
import type { AdminPublish } from "../../../../lib/olx/api/validators"
import { variantProductId } from "../../../../lib/olx/catalog"
import { publishAdvert } from "../../../../lib/olx/engine"
import { buildEngine } from "../../../../lib/olx/runtime"

/** `POST /admin/olx/publish` — publishes one variant. Every outcome is described in `result`. */
export async function POST(req: MedusaRequest<z.infer<typeof AdminPublish>>, res: MedusaResponse) {
  const { variant_id, advert } = req.validatedBody
  const product_id = await variantProductId(req.scope, variant_id)
  if (!product_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${variant_id} was not found.`)
  }
  const engine = await buildEngine(req.scope)
  res.json(writeView(await publishAdvert(engine, { variant_id, product_id, advert })))
}
