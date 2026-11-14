import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

import ComplianceModule from "../modules/compliance"

/** Read-only link from a variant to its Omnibus price history. */
export default defineLink(
  { linkable: ProductModule.linkable.productVariant, field: "id" },
  { ...ComplianceModule.linkable.compliancePriceRecord.id, primaryKey: "variant_id", isList: true },
  { readOnly: true }
)
