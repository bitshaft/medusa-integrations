import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { olxClearStockStep, olxMarkSoldStep } from "./steps"

export const markOlxAdvertSoldWorkflowId = "mark-olx-advert-sold"

/**
 * "Sold on OLX": records that the advert must come down, and clears the
 * variant's free stock, so nobody can buy it in the store. Sending that to OLX
 * happens after the workflow and is repeated until OLX confirms.
 */
export const markOlxAdvertSoldWorkflow = createWorkflow(
  markOlxAdvertSoldWorkflowId,
  (input: { advert_id: string; variant_id: string }) => {
    // In this order: clearing stock fires the event that takes down adverts of store sales.
    const advert = olxMarkSoldStep({ advert_id: input.advert_id })
    olxClearStockStep({ variant_id: input.variant_id })
    return new WorkflowResponse(advert)
  }
)
