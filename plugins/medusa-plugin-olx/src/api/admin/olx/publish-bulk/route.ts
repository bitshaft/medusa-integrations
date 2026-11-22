import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"

import type { AdminBulkPublish } from "../../../../lib/olx/api/validators"
import { loadVariantDrafts } from "../../../../lib/olx/catalog"
import { publishAdvert } from "../../../../lib/olx/engine"
import { buildEngine, resolveOlx } from "../../../../lib/olx/runtime"

/**
 * `POST /admin/olx/publish-bulk` — publishes chosen variants with one category
 * and its attributes; everything else comes from each product and the
 * defaults. One by one, so one refused advert does not stop the others.
 */
export async function POST(req: MedusaRequest<z.infer<typeof AdminBulkPublish>>, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  const engine = await buildEngine(req.scope)
  const { variant_ids, category_id, attributes } = req.validatedBody
  const defaults = await service.getDefaults()
  const drafts = await loadVariantDrafts(req.scope, variant_ids, defaults, attributes)
  const byVariant = new Map(drafts.map((row) => [row.variant_id, row]))
  const results: Array<Record<string, unknown>> = []
  for (const variantId of new Set(variant_ids)) {
    const row = byVariant.get(variantId)
    if (!row) {
      results.push({ variant_id: variantId, title: variantId, result: "conflict", code: "variant_missing" })
      continue
    }
    const title = row.draft.title
    try {
      const outcome = await publishAdvert(engine, {
        variant_id: row.variant_id,
        product_id: row.product_id,
        advert: { ...row.draft, category_id },
      })
      const { advert: _advert, ...rest } = outcome as typeof outcome & { advert?: unknown }
      results.push({ variant_id: row.variant_id, title, ...rest })
    } catch (error) {
      // The adverts before this one are already on OLX: the admin must see them.
      results.push({ variant_id: row.variant_id, title, result: "refused", message: (error as Error).message })
    }
  }
  res.json({ results })
}
