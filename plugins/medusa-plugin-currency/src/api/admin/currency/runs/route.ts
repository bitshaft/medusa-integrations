import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/currency/api/utils"

/** `GET /admin/currency/runs` — the history of fills, newest first. `?product_id=` narrows it to one product. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const { limit, offset, product_id } = req.validatedQuery as { limit: number; offset: number; product_id?: string }
  let filters: Record<string, unknown> = {}
  if (product_id) {
    const records = await service.listCurrencyFilledPrices({ product_id }, { select: ["run_id"], take: 10_000 })
    filters = { id: [...new Set(records.map((record) => record.run_id))] }
  }
  const [runs, count] = await service.listAndCountCurrencyFillRuns(filters, {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" },
  })
  res.json({ runs, count, limit, offset })
}
