import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"

import NegotiationsModule from "../modules/negotiations"

/** Read-only link through `negotiation_thread.variant_id`: nothing extra is stored. */
export default defineLink(
  { linkable: NegotiationsModule.linkable.negotiationThread, field: "variant_id" },
  ProductModule.linkable.productVariant,
  { readOnly: true }
)
