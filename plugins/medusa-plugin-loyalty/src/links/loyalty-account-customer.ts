import CustomerModule from "@medusajs/medusa/customer"
import { defineLink } from "@medusajs/framework/utils"

import LoyaltyModule from "../modules/loyalty"

/**
 * Read-only link from a customer to their loyalty account:
 * `query.graph({ entity: "customer", fields: ["loyalty_account.*"] })`.
 */
export default defineLink(
  { linkable: CustomerModule.linkable.customer, field: "id" },
  { ...LoyaltyModule.linkable.loyaltyAccount.id, primaryKey: "customer_id" },
  { readOnly: true }
)
