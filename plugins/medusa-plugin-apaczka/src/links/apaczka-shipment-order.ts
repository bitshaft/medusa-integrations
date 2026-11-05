import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

import ApaczkaModule from "../modules/apaczka"

/**
 * Read-only link from an order to its Apaczka shipments:
 *
 * ```ts
 * query.graph({ entity: "order", fields: ["id", "apaczka_shipments.*"] })
 * ```
 */
export default defineLink(
  {
    linkable: OrderModule.linkable.order,
    field: "id",
  },
  {
    ...ApaczkaModule.linkable.apaczkaShipment.id,
    primaryKey: "order_id",
    isList: true,
  },
  { readOnly: true }
)
