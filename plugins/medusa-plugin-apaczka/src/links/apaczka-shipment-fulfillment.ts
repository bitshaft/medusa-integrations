import FulfillmentModule from "@medusajs/medusa/fulfillment"
import { defineLink } from "@medusajs/framework/utils"

import ApaczkaModule from "../modules/apaczka"

/**
 * Read-only link (no pivot table): `apaczka_shipment.fulfillment_id` points
 * at the fulfillment, so Query can join them in both directions:
 *
 * ```ts
 * query.graph({ entity: "fulfillment", fields: ["id", "apaczka_shipment.*"] })
 * ```
 */
export default defineLink(
  {
    linkable: FulfillmentModule.linkable.fulfillment,
    field: "id",
  },
  {
    ...ApaczkaModule.linkable.apaczkaShipment.id,
    primaryKey: "fulfillment_id",
  },
  { readOnly: true }
)
