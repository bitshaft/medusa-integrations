import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { toPublicPoint } from "../../../../lib/apaczka/points"
import { resolveApaczka } from "../../../../lib/apaczka/api/utils"
import type { StorePointsQuery } from "../../../../lib/apaczka/api/validators"

/**
 * `GET /store/apaczka/points?type=INPOST&q=warszawa&lat=52.23&lng=21.01`
 * `GET /store/apaczka/points?type=INPOST&bbox=20.95,52.20,21.05,52.25&limit=500`
 *
 * Searches parcel points for the storefront picker: by text, nearest to a
 * location, or inside a map area (`bbox=west,south,east,north`). Points come
 * from the lists stored in the database, so the full list never reaches the
 * browser and the Apaczka secret stays on the server.
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
    bbox: query.bbox,
    cod: query.cod,
    sending: query.sending,
    limit: query.limit,
  })

  res.setHeader("Cache-Control", "public, max-age=300")
  res.json({ points: points.map(toPublicPoint), count: points.length })
}
