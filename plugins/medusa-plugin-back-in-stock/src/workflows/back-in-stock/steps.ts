import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { scheduleChecks } from "../../lib/back-in-stock/engine"
import { engineFor, resolveBackInStock } from "../../lib/back-in-stock/runtime"
import { endSubscription, subscribe, type SubscribeInput } from "../../lib/back-in-stock/subscriptions"
import type { Pair, SubscriptionRecord } from "../../lib/back-in-stock/types"

export const createSubscriptionStepId = "back-in-stock-create-subscription"

/** Subscribes; on rollback deletes a subscription this step created. */
export const createSubscriptionStep = createStep(
  createSubscriptionStepId,
  async (input: SubscribeInput, { container }) => {
    const result = await subscribe(container, input)
    return new StepResponse(result, result.created ? result.subscription.id : null)
  },
  async (createdId, { container }) => {
    if (createdId) {
      await resolveBackInStock(container).deleteSubscriptionsAndTokens([createdId])
    }
  }
)

export const endSubscriptionStepId = "back-in-stock-end-subscription"

/** Ends an open subscription; on rollback restores its previous status. */
export const endSubscriptionStep = createStep(
  endSubscriptionStepId,
  async (input: { id: string; status: "unsubscribed" | "purchased" | "expired" }, { container }) => {
    const service = resolveBackInStock(container)
    const [subscription] = (await service.listBackInStockSubscriptions(
      { id: input.id },
      { take: 1 }
    )) as unknown as SubscriptionRecord[]
    if (!subscription) {
      return new StepResponse({ outcome: "invalid" as const, subscription: null }, null)
    }
    const result = await endSubscription(container, subscription, input.status)
    return new StepResponse(
      result,
      result.outcome === "done" ? { id: subscription.id, status: subscription.status } : null
    )
  },
  async (previous, { container }) => {
    if (previous) {
      await resolveBackInStock(container).updateBackInStockSubscriptions({
        id: previous.id,
        status: previous.status,
        ended_at: null,
      })
    }
  }
)

export const scheduleCheckStepId = "back-in-stock-schedule-check"

/**
 * Schedules stock checks for variants, e.g. after an inventory sync that
 * writes stock without going through Medusa's inventory module. Nothing to
 * compensate: a check only reads stock.
 */
export const scheduleCheckStep = createStep(scheduleCheckStepId, async (input: { pairs: Pair[] }, { container }) => {
  const engine = await engineFor(container)
  return new StepResponse({ scheduled: engine ? await scheduleChecks(engine, input.pairs) : 0 })
})
