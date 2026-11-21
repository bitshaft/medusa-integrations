import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { fold, olxReadError } from "../../../../lib/olx/api/utils"
import type { OlxCity } from "../../../../lib/olx/client"
import { resolveOlx } from "../../../../lib/olx/runtime"

/** OLX has no city search and the list barely changes, so it is kept for a day. */
const TTL_MS = 24 * 3_600_000
let cache: { at: number; demo: boolean; cities: Array<OlxCity & { key: string }> } | null = null

/** `GET /admin/olx/cities?q=` — cities whose name starts with the text (Polish letters optional). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  const { demo } = await service.getOptions()
  const api = await service.getApi()
  try {
    if (!cache || cache.demo !== demo || Date.now() - cache.at > TTL_MS) {
      const cities = await api.cities()
      cache = { at: Date.now(), demo, cities: cities.map((city) => ({ ...city, key: fold(city.name) })) }
    }
  } catch (error) {
    throw olxReadError(error)
  }
  const q = fold(String(req.validatedQuery.q))
  const hits = cache.cities
    .filter((city) => city.key.startsWith(q))
    .sort((a, b) => a.key.length - b.key.length)
    .slice(0, 20)
    .map(({ key: _key, ...city }) => city)
  res.json({ cities: hits })
}
