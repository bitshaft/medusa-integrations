import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { loadAvailability } from "../../../../lib/back-in-stock/availability"
import { channelNames, variantLabels } from "../../../../lib/back-in-stock/api/enrich"
import { resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import type { AdminWantedQueryParams } from "../../../../lib/back-in-stock/api/validators"

/**
 * `GET /admin/back-in-stock/wanted` — variants ranked by people waiting,
 * per sales channel, with their current availability; `product_id` (one or
 * several) narrows it to those products. `problem` is set for
 * stock-managed variants without an inventory item: they can never come
 * back in stock until that is fixed.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const { limit, offset, demo, product_id } = req.validatedQuery as unknown as AdminWantedQueryParams
  const settings = await service.getSettings()
  const { rows, count } = await service.rankWanted({ limit, offset, demo, productIds: product_id })

  const byChannel = new Map<string, string[]>()
  for (const row of rows) {
    byChannel.set(row.sales_channel_id, [...(byChannel.get(row.sales_channel_id) ?? []), row.variant_id])
  }
  const availability = new Map<string, Awaited<ReturnType<typeof loadAvailability>>>()
  for (const [channel, variants] of byChannel) {
    availability.set(channel, await loadAvailability(req.scope, variants, channel, settings.minQuantity))
  }
  const [labels, channels] = await Promise.all([
    variantLabels(
      req.scope,
      rows.map((row) => row.variant_id)
    ),
    channelNames(
      req.scope,
      rows.map((row) => row.sales_channel_id)
    ),
  ])

  res.json({
    variants: rows.map((row) => {
      const current = availability.get(row.sales_channel_id)?.get(row.variant_id)
      return {
        ...row,
        ...labels[row.variant_id],
        sales_channel_name: channels[row.sales_channel_id] ?? row.sales_channel_id,
        in_stock: current?.in_stock ?? false,
        available: current?.available ?? null,
        reason: current?.reason ?? null,
        problem: current?.reason === "no_inventory_item" || current?.reason === "missing" ? current.reason : null,
      }
    }),
    count,
    limit,
    offset,
  })
}
