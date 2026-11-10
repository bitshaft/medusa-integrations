import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export type EmitEventsInput = Array<{ name: string; data: Record<string, unknown> }>

export const emitEventsStepId = "apaczka-emit-events"

/**
 * Emits several events whose names are only known at runtime. Like Medusa's
 * `emitEventStep`, events join the workflow's event group, so they are
 * released only if the workflow succeeds.
 */
export const emitEventsStep = createStep(
  emitEventsStepId,
  async (events: EmitEventsInput, context) => {
    if (!events?.length) {
      return new StepResponse(undefined)
    }
    const eventBus = context.container.resolve(Modules.EVENT_BUS)
    const metadata = context.eventGroupId ? { eventGroupId: context.eventGroupId } : {}

    await eventBus.emit(events.map((event) => ({ name: event.name, data: event.data, metadata })))

    return new StepResponse(undefined, {
      eventGroupId: context.eventGroupId,
      eventNames: events.map((event) => event.name),
    })
  },
  async (compensation, context) => {
    if (!compensation?.eventGroupId) {
      return
    }
    const eventBus = context.container.resolve(Modules.EVENT_BUS)
    await eventBus.clearGroupedEvents(compensation.eventGroupId, { eventNames: compensation.eventNames })
  }
)
