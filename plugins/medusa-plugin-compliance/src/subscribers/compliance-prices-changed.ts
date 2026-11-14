import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

import { queuePriceCheck } from "../lib/compliance/server/price-queue"
import { variantsForPriceSets } from "../lib/compliance/server/prices"
import { moduleOn } from "../lib/compliance/server/runtime"

type Payload = { id?: string; ids?: string[] }

/**
 * Prices, price lists or promotions changed: record the affected variants'
 * prices after the burst of events. Price list and promotion changes can
 * touch any variant, so those check all. Discounts that start or end on a
 * schedule emit nothing; the hourly job records them.
 */
export default async function compliancePricesChanged({ event, container }: SubscriberArgs<Payload>) {
  if (!(await moduleOn(container, "omnibus"))) return
  if (event.name === "product-variant.updated") {
    const ids = event.data.ids ?? (event.data.id ? [event.data.id] : [])
    queuePriceCheck(container, ids.length ? ids : "all")
    return
  }
  if (!event.name.startsWith("pricing.price.")) {
    queuePriceCheck(container, "all")
    return
  }
  const ids = event.data.ids ?? (event.data.id ? [event.data.id] : [])
  try {
    const pricing = container.resolve(Modules.PRICING) as unknown as {
      listPrices: (
        filters: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<Array<{ price_set_id?: string }>>
    }
    const prices = await pricing.listPrices({ id: ids }, { select: ["id", "price_set_id"], withDeleted: true })
    const variants = await variantsForPriceSets(
      container,
      prices.map((p) => p.price_set_id).filter(Boolean) as string[]
    )
    queuePriceCheck(container, variants.length ? variants : "all")
  } catch {
    queuePriceCheck(container, "all")
  }
}

export const config: SubscriberConfig = {
  event: [
    // Price edits in the admin price grid emit no workflow event; the Pricing
    // Module events are the only signal. The hourly job is the fallback.
    // eslint-disable-next-line @medusajs/prefer-workflow-event-over-module-event
    "pricing.price.created",
    // eslint-disable-next-line @medusajs/prefer-workflow-event-over-module-event
    "pricing.price.updated",
    // eslint-disable-next-line @medusajs/prefer-workflow-event-over-module-event
    "pricing.price.deleted",
    "product-variant.updated",
    "price-list.created",
    "price-list.updated",
    "price-list.deleted",
    "price-list.prices_added",
    "price-list.prices_updated",
    "price-list.prices_removed",
    "promotion.promotion.created",
    "promotion.promotion.updated",
    "promotion.promotion.deleted",
    "promotion.campaign.updated",
    "promotion.application_method.updated",
  ],
  context: { subscriberId: "compliance-prices-changed" },
}
