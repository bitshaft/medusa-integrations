import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveApaczka } from "../../../../../lib/apaczka/api/utils"
import type { StorePointClustersQuery } from "../../../../../lib/apaczka/api/validators"

/**
 * `GET /store/apaczka/points/clusters?type=INPOST&bbox=14.1,49.0,24.2,54.9&zoom=6`
 *
 * A zoomed-out map's points, grouped: one cluster per grid cell of about 85
 * pixels at that zoom, with its point count, average position and extent
 * (zoom the map to `bounds` on click). A cluster of one point carries its
 * `id`. The whole of Poland is a few dozen clusters at country zoom; zoomed
 * in, load the points themselves with `GET /store/apaczka/points?bbox=…`.
 */
export async function GET(req: MedusaRequest<unknown, StorePointClustersQuery>, res: MedusaResponse) {
  const query = req.validatedQuery as StorePointClustersQuery
  const clusters = await (
    await resolveApaczka(req).getCatalog()
  ).pointClusters({
    type: query.type,
    countryCode: query.country_code,
    bbox: query.bbox,
    zoom: query.zoom,
    cod: query.cod,
    sending: query.sending,
  })

  res.setHeader("Cache-Control", "public, max-age=300")
  res.json({ clusters, count: clusters.length })
}
