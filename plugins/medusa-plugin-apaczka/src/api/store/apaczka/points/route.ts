import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { toPublicPoint } from "../../../../lib/apaczka/points"
import { resolveApaczka } from "../../../../lib/apaczka/api/utils"
import type { StorePointsQuery } from "../../../../lib/apaczka/api/validators"

/**
 * `GET /store/apaczka/points?type=INPOST&q=warszawa&lat=52.23&lng=21.01`
 *
 * Searches parcel points for the storefront picker. Results come from a
 * server-side cache, so the full point list never reaches the browser and
 * the Apaczka secret stays on the server.
 */
export async function GET(req: MedusaRequest<unknown, StorePointsQuery>, res: MedusaResponse) {
  const query = req.validatedQuery as StorePointsQuery
  const points = await (
    await resolveApaczka(req).getCatalog()
  ).searchPoints({
    type: query.type,
    countryCode: query.country_code,
    query: query.q,
    latitude: query.lat,
    longitude: query.lng,
    cod: query.cod,
    sending: query.sending,
    limit: query.limit,
  })

  res.setHeader("Cache-Control", "public, max-age=300")
  res.json({ points: points.map(toPublicPoint), count: points.length })
}
