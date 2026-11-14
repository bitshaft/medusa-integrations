import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { recomputeGpsr } from "../lib/compliance/server/gpsr"
import { queuePriceCheck } from "../lib/compliance/server/price-queue"
import { moduleOn, resolveCompliance } from "../lib/compliance/server/runtime"

type Payload = { id?: string; ids?: string[] }

/** A product changed: check its GPSR data at once; a new variant gets its first price record. */
export default async function complianceProductChanged({ event, container }: SubscriberArgs<Payload>) {
  if (!(await resolveCompliance(container).isEnabled())) return
  const ids = event.data.ids ?? (event.data.id ? [event.data.id] : [])
  if (!ids.length) return
  if (event.name === "product-variant.created") {
    if (await moduleOn(container, "omnibus")) queuePriceCheck(container, ids)
    return
  }
  if (!(await moduleOn(container, "gpsr"))) return
  if (event.name === "product.deleted") {
    const service = resolveCompliance(container)
    const rows = await service.listComplianceProductSafeties({ product_id: ids }, { select: ["id"] })
    if (rows.length) await service.softDeleteComplianceProductSafeties(rows.map((r) => r.id))
    return
  }
  await recomputeGpsr(container, ids)
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted", "product-variant.created"],
  context: { subscriberId: "compliance-product-changed" },
}
