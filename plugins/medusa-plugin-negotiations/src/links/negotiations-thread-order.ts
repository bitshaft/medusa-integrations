import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"

import NegotiationsModule from "../modules/negotiations"

/** Read-only link through `negotiation_thread.order_id`: nothing extra is stored. */
export default defineLink(
  { linkable: NegotiationsModule.linkable.negotiationThread, field: "order_id" },
  OrderModule.linkable.order,
  { readOnly: true }
)
