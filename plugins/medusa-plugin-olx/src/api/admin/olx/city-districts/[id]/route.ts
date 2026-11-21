import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { olxReadError } from "../../../../../lib/olx/api/utils"
import { resolveOlx } from "../../../../../lib/olx/runtime"

/** `GET /admin/olx/city-districts/:id` — a city's districts (OLX requires one where they exist). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The city id must be a positive number.")
  }
  const api = await resolveOlx(req.scope).getApi()
  try {
    res.json({ districts: await api.districts(id) })
  } catch (error) {
    throw olxReadError(error)
  }
}
