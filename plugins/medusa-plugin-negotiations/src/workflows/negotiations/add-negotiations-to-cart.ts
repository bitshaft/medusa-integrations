import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"

import { negotiationsClaimWriteStep } from "./steps"

export type AddNegotiationsToCartInput = {
  thread_id: string
  actor_id: string | null
  cart_id: string
  items: Array<{
    variant_id: string
    quantity: number
    unit_price: string
    is_tax_inclusive: boolean
    metadata: Record<string, unknown>
  }>
}

/**
 * The agreed lines into the customer's cart, at the agreed unit prices.
 * One live cart write per thread; the caller records the line ids.
 */
export const addNegotiationsToCartWorkflow = createWorkflow(
  "add-negotiations-to-cart",
  (input: AddNegotiationsToCartInput) => {
    const write = negotiationsClaimWriteStep({ thread_id: input.thread_id, kind: "cart", actor_id: input.actor_id })
    const cartInput = transform({ input }, ({ input }) => ({ cart_id: input.cart_id, items: input.items }))
    addToCartWorkflow.runAsStep({ input: cartInput as never })
    return new WorkflowResponse(write)
  }
)
