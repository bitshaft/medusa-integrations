import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireModule } from "../../../../../lib/compliance/api/utils"
import type { AdminGpsrQuery } from "../../../../../lib/compliance/api/validators"
import { demoGpsrProducts } from "../../../../../lib/compliance/demo"

/** `GET /admin/compliance/gpsr/products?complete=false&q=`: products with their GPSR gaps. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "gpsr")
  const query = req.validatedQuery as unknown as AdminGpsrQuery
  if (await isDemo(req)) {
    const rows = demoGpsrProducts().filter(
      (p) =>
        (query.complete === undefined || String(p.complete) === query.complete) &&
        (!query.q || p.title.toLowerCase().includes(query.q.toLowerCase()))
    )
    res.json({ products: rows, count: rows.length, limit: query.limit, offset: query.offset })
    return
  }
  const filters: Record<string, unknown> = {}
  if (query.complete) filters.complete = query.complete === "true"
  if (query.q) filters.product_title = { $ilike: `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` }
  const [rows, count] = await service.listAndCountComplianceProductSafeties(filters, {
    order: { complete: "ASC", product_title: "ASC" },
    take: query.limit,
    skip: query.offset,
  })
  res.json({
    products: rows.map((r) => ({
      product_id: r.product_id,
      title: r.product_title,
      status: r.product_status,
      gaps: r.gaps ?? [],
      complete: r.complete,
      checked_at: r.checked_at,
    })),
    count,
    limit: query.limit,
    offset: query.offset,
  })
}
