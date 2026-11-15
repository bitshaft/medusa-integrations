import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"

import NegotiationsModule from "../modules/negotiations"

/**
 * Read-only link through `negotiation_thread.customer_id`: nothing extra is
 * stored. The alias is `customer_account` because the thread's own
 * `customer` field is the snapshot taken when the thread was sent.
 */
export default defineLink(
  { linkable: NegotiationsModule.linkable.negotiationThread, field: "customer_id" },
  { linkable: CustomerModule.linkable.customer, alias: "customer_account" },
  { readOnly: true }
)
