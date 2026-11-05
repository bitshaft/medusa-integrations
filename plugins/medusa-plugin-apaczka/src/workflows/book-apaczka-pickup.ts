import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { ApaczkaEvents } from "../lib/events"
import { type BookPickupInput, bookPickupStep } from "./steps/book-pickup"
import { emitEventsStep } from "./steps/emit-events"

export type BookApaczkaPickupWorkflowInput = BookPickupInput

export const bookApaczkaPickupWorkflowId = "apaczka-book-pickup"

/** Books a courier pickup for one or more shipments. */
export const bookApaczkaPickupWorkflow = createWorkflow(
  bookApaczkaPickupWorkflowId,
  (input: BookApaczkaPickupWorkflowInput) => {
    const result = bookPickupStep(input)

    const events = transform({ result, input }, ({ result, input }) => [
      {
        name: ApaczkaEvents.PICKUP_BOOKED,
        data: {
          shipment_ids: result.shipments.map((s) => s.id),
          date: input.date,
          hour_from: input.hour_from,
          hour_to: input.hour_to,
          pickup_number: result.pickup_number,
        },
      },
    ])
    emitEventsStep(events)

    return new WorkflowResponse(result)
  }
)
