import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { verifyOrderTaxIdStep } from "./steps/verify"

export type VerifyWhitelistVatOrderWorkflowInput = {
  order_id: string
  /** Ask the registers even when a recent answer is stored. */
  force?: boolean
}

export const verifyWhitelistVatOrderWorkflowId = "verify-whitelist-vat-order"

/**
 * Verifies the tax ID found on an order (see the `taxIdKeys` option) and
 * stores the registers' answers as the order's proof. The result has
 * `tax_id: null` when the order has no tax ID.
 */
export const verifyWhitelistVatOrderWorkflow = createWorkflow(
  verifyWhitelistVatOrderWorkflowId,
  (input: VerifyWhitelistVatOrderWorkflowInput) => {
    return new WorkflowResponse(verifyOrderTaxIdStep(input))
  }
)
