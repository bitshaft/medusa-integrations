import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { olxReadError } from "../../../../../lib/olx/api/utils"
import { resolveOlx } from "../../../../../lib/olx/runtime"

/** `GET /admin/olx/category-attributes/:id` — the fields a category asks for. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The category id must be a positive number.")
  }
  const api = await resolveOlx(req.scope).getApi()
  try {
    res.json({ attributes: await api.categoryAttributes(id) })
  } catch (error) {
    throw olxReadError(error)
  }
}
