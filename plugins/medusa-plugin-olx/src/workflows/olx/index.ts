import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { olxClearStockStep, olxMarkSoldStep } from "./steps"

export const markOlxAdvertSoldWorkflowId = "mark-olx-advert-sold"

/**
 * "Sold on OLX": clears the variant's free stock, so nobody can buy it in
 * the store, and records that the advert must come down. Sending that to OLX
 * happens after the workflow and is repeated until OLX confirms.
 */
export const markOlxAdvertSoldWorkflow = createWorkflow(
  markOlxAdvertSoldWorkflowId,
  (input: { advert_id: string; variant_id: string }) => {
    olxClearStockStep({ variant_id: input.variant_id })
    return new WorkflowResponse(olxMarkSoldStep({ advert_id: input.advert_id }))
  }
)
