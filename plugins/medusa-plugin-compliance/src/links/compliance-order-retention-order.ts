import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

import ComplianceModule from "../modules/compliance"

/** Read-only link from an order to the date its billing data is removed after an erasure. */
export default defineLink(
  { linkable: OrderModule.linkable.order, field: "id" },
  { ...ComplianceModule.linkable.complianceOrderRetention.id, primaryKey: "order_id" },
  { readOnly: true }
)
