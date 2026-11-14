import CustomerModule from "@medusajs/medusa/customer"
import { defineLink } from "@medusajs/framework/utils"

import ComplianceModule from "../modules/compliance"

/** Read-only link from a customer to their consent register entries. */
export default defineLink(
  { linkable: CustomerModule.linkable.customer, field: "id" },
  { ...ComplianceModule.linkable.complianceConsentEntry.id, primaryKey: "customer_id", isList: true },
  { readOnly: true }
)
