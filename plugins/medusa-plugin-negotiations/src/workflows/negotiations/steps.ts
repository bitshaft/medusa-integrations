import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { NegotiationError } from "../../lib/negotiations/messages"
import { NEGOTIATIONS_MODULE } from "../../modules/negotiations"
import type NegotiationsModuleService from "../../modules/negotiations/service"

/**
 * Reserves the one write a thread may have of this kind. A second request
 * gets no row from the partial unique index and stops here, before
 * anything is written to Medusa. Compensation marks the reservation failed,
 * which frees it.
 */
export const negotiationsClaimWriteStep = createStep(
  "negotiations-claim-write",
  async (input: { thread_id: string; kind: "draft_order" | "cart"; actor_id: string | null }, { container }) => {
    const service = container.resolve<NegotiationsModuleService>(NEGOTIATIONS_MODULE)
    const write = await service.claimWrite(input.thread_id, input.kind, input.actor_id)
    if (!write) {
      const live = (await service.listWrites(input.thread_id)).find(
        (w) => w.kind === input.kind && ["pending", "done", "ordered"].includes(w.status)
      )
      if (live?.status === "pending") throw new NegotiationError("write_in_progress")
      throw new NegotiationError(
        input.kind === "draft_order"
          ? "draft_order_exists"
          : live?.status === "ordered"
            ? "already_ordered"
            : "already_in_cart"
      )
    }
    return new StepResponse(write, write.id)
  },
  async (writeId, { container }) => {
    if (!writeId) return
    const service = container.resolve<NegotiationsModuleService>(NEGOTIATIONS_MODULE)
    await service.updateWrite(writeId, { status: "failed", error: "rolled back" })
  }
)

export const negotiationsFinishWriteStep = createStep(
  "negotiations-finish-write",
  async (input: { write_id: string; target_id: string; line_item_ids?: string[] | null }, { container }) => {
    const service = container.resolve<NegotiationsModuleService>(NEGOTIATIONS_MODULE)
    const write = await service.updateWrite(input.write_id, {
      status: "done",
      target_id: input.target_id,
      line_item_ids: input.line_item_ids ?? null,
    })
    return new StepResponse(write)
  }
)
