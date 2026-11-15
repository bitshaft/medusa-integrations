import { defineLink } from "@medusajs/framework/utils"
import CartModule from "@medusajs/medusa/cart"

import NegotiationsModule from "../modules/negotiations"

/** Read-only link through `negotiation_thread.source_cart_id`: nothing extra is stored. */
export default defineLink(
  { linkable: NegotiationsModule.linkable.negotiationThread, field: "source_cart_id" },
  CartModule.linkable.cart,
  { readOnly: true }
)
