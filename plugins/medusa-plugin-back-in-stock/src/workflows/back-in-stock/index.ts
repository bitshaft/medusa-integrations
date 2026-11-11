import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import type { SubscribeInput } from "../../lib/back-in-stock/subscriptions"
import type { Pair } from "../../lib/back-in-stock/types"
import { createSubscriptionStep, endSubscriptionStep, scheduleCheckStep } from "./steps"

export const createBackInStockSubscriptionWorkflowId = "create-back-in-stock-subscription"

/**
 * Subscribes an email address to a variant in a sales channel, as the store
 * route does. Throws `variant_in_stock` when the variant can be ordered now.
 *
 * ```ts
 * await createBackInStockSubscriptionWorkflow(container).run({
 *   input: { email: "anna@example.com", variant_id, sales_channel_id, locale: "pl" },
 * })
 * ```
 */
export const createBackInStockSubscriptionWorkflow = createWorkflow(
  createBackInStockSubscriptionWorkflowId,
  (input: SubscribeInput) => new WorkflowResponse(createSubscriptionStep(input))
)

export const endBackInStockSubscriptionWorkflowId = "end-back-in-stock-subscription"

/** Ends a subscription (`unsubscribed`, `purchased` or `expired`). */
export const endBackInStockSubscriptionWorkflow = createWorkflow(
  endBackInStockSubscriptionWorkflowId,
  (input: { id: string; status: "unsubscribed" | "purchased" | "expired" }) =>
    new WorkflowResponse(endSubscriptionStep(input))
)

export const checkBackInStockVariantsWorkflowId = "check-back-in-stock-variants"

/**
 * Schedules stock checks for variants in sales channels, after the usual
 * delay. Use it when stock changes outside Medusa's inventory module (a
 * direct database sync), which emits no events.
 */
export const checkBackInStockVariantsWorkflow = createWorkflow(
  checkBackInStockVariantsWorkflowId,
  (input: { pairs: Pair[] }) => new WorkflowResponse(scheduleCheckStep(input))
)

export {
  BackInStockEvents,
  type BackInStockNotifiedEventData,
  type BackInStockRestockedEventData,
  type BackInStockSubscriptionEventData,
} from "../../lib/back-in-stock/events"
export type { BackInStockPluginOptionsInput as BackInStockPluginOptions } from "../../lib/back-in-stock/options"
export type { SubscribeInput, SubscribeResult } from "../../lib/back-in-stock/subscriptions"
