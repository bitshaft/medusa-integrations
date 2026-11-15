import type { CreateOrderDTO } from "@medusajs/framework/types"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createOrderWorkflow } from "@medusajs/medusa/core-flows"

import { negotiationsClaimWriteStep, negotiationsFinishWriteStep } from "./steps"

export type CreateNegotiationsDraftOrderInput = {
  thread_id: string
  actor_id: string | null
  order: CreateOrderDTO & Record<string, unknown>
}

/**
 * A draft order from an accepted thread, exactly once: the reservation
 * comes first, and when creating the order fails, the reservation is
 * released by compensation (and the order, if created, is removed).
 */
export const createNegotiationsDraftOrderWorkflow = createWorkflow(
  "create-negotiations-draft-order",
  (input: CreateNegotiationsDraftOrderInput) => {
    const write = negotiationsClaimWriteStep({
      thread_id: input.thread_id,
      kind: "draft_order",
      actor_id: input.actor_id,
    })
    const order = createOrderWorkflow.runAsStep({ input: input.order as never })
    const finishInput = transform({ write, order }, ({ write, order }) => ({
      write_id: write.id,
      target_id: (order as { id: string }).id,
    }))
    negotiationsFinishWriteStep(finishInput)
    return new WorkflowResponse(order)
  }
)
