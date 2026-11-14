import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

import LoyaltyModule from "../modules/loyalty"

/** Read-only link from an order to its ledger entries: `query.graph({ entity: "order", fields: ["loyalty_entries.*"] })`. */
export default defineLink(
  { linkable: OrderModule.linkable.order, field: "id" },
  { ...LoyaltyModule.linkable.loyaltyEntry.id, primaryKey: "order_id", isList: true },
  { readOnly: true }
)
