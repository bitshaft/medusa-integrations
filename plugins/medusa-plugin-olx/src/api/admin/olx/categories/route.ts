import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { olxReadError } from "../../../../lib/olx/api/utils"
import { resolveOlx } from "../../../../lib/olx/runtime"

/** `GET /admin/olx/categories?q=` — OLX's category suggestions for a title. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const api = await resolveOlx(req.scope).getApi()
  try {
    res.json({ categories: await api.suggestCategories(String(req.validatedQuery.q)) })
  } catch (error) {
    throw olxReadError(error)
  }
}
