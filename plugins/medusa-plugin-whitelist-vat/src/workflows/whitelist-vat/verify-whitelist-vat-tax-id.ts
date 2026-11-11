import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import type { VerifyInput } from "../../lib/whitelist-vat/verify"
import { verifyTaxIdStep } from "./steps/verify"

export type VerifyWhitelistVatTaxIdWorkflowInput = VerifyInput

export const verifyWhitelistVatTaxIdWorkflowId = "verify-whitelist-vat-tax-id"

/**
 * Verifies a Polish NIP or an EU VAT number and returns the verdict with
 * the company's data.
 *
 * ```ts
 * const { result } = await verifyWhitelistVatTaxIdWorkflow(container).run({
 *   input: { number: "PL5260250274", customer_id: customer.id },
 * })
 * if (result.could_not_verify) {
 *   // the registers were down: decide later, do not treat as invalid
 * }
 * ```
 */
export const verifyWhitelistVatTaxIdWorkflow = createWorkflow(
  verifyWhitelistVatTaxIdWorkflowId,
  (input: VerifyWhitelistVatTaxIdWorkflowInput) => {
    return new WorkflowResponse(verifyTaxIdStep(input))
  }
)
