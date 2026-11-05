import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { toPublicPoint } from "../../../../../../lib/points"
import { resolveApaczka } from "../../../../../utils"
import type { StorePointQuery } from "../../../../../validators"

/** `GET /store/apaczka/points/INPOST/WAW01M` — one point, e.g. to show the saved choice. */
export async function GET(req: MedusaRequest<unknown, StorePointQuery>, res: MedusaResponse) {
  const { country_code } = req.validatedQuery as StorePointQuery
  const point = await (await resolveApaczka(req).getCatalog()).findPoint(req.params.type, req.params.id, country_code)

  if (!point) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Point ${req.params.id} was not found`)
  }

  res.setHeader("Cache-Control", "public, max-age=300")
  res.json({ point: toPublicPoint(point) })
}
