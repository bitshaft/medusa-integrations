import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

import ComplianceModule from "../modules/compliance"

/**
 * Read-only link from a product to its GPSR data:
 * `query.graph({ entity: "product", fields: ["compliance_product_safety.*"] })`.
 */
export default defineLink(
  { linkable: ProductModule.linkable.product, field: "id" },
  { ...ComplianceModule.linkable.complianceProductSafety.id, primaryKey: "product_id" },
  { readOnly: true }
)
