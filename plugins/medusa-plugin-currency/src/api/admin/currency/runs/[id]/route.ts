import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveEnabled } from "../../../../../lib/currency/api/utils"

/** `GET /admin/currency/runs/:id` — one fill with every price it wrote. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const [run] = await service.listCurrencyFillRuns({ id: req.params.id }, { take: 1 })
  if (!run) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No fill with the id ${req.params.id}.`)
  }
  const prices = await service.listCurrencyFilledPrices(
    { run_id: run.id },
    { take: 10_000, order: { created_at: "ASC" } }
  )
  res.json({ run, prices })
}
