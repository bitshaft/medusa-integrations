import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { verifyAndEmit, verifyOrder } from "../../../lib/whitelist-vat/records"
import type { VerifyInput } from "../../../lib/whitelist-vat/verify"

export const verifyTaxIdStepId = "whitelist-vat-verify-tax-id"

/**
 * Verifies a tax ID. There is nothing to compensate: the step only reads
 * the registers and appends to the plugin's own history, which stays true
 * even when the surrounding workflow is rolled back.
 */
export const verifyTaxIdStep = createStep(verifyTaxIdStepId, async (input: VerifyInput, { container }) => {
  return new StepResponse(await verifyAndEmit(container, input))
})

export const verifyOrderTaxIdStepId = "whitelist-vat-verify-order"

/** Verifies the tax ID found on an order. Nothing to compensate, as above. */
export const verifyOrderTaxIdStep = createStep(
  verifyOrderTaxIdStepId,
  async (input: { order_id: string; force?: boolean; trigger?: string }, { container }) => {
    return new StepResponse(
      await verifyOrder(container, input.order_id, { force: input.force, trigger: input.trigger ?? "workflow" })
    )
  }
)
