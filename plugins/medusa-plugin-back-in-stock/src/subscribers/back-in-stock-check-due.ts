import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { runCheck } from "../lib/back-in-stock/engine"
import { BackInStockEvents } from "../lib/back-in-stock/events"
import { engineFor } from "../lib/back-in-stock/runtime"

/**
 * Runs a stock check when its delay is over: re-checks availability and,
 * on a change from out of stock to in stock, notifies the waiting
 * subscriptions. A failure leaves the check claimed; it is run again when
 * the claim goes stale (at startup or by the daily cleanup job).
 */
export default async function backInStockCheckDue({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const engine = await engineFor(container)
    if (!engine || typeof event.data?.id !== "string") {
      return
    }
    const outcome = await runCheck(engine, event.data.id)
    if (outcome.status === "done" && (outcome.notified || outcome.failed)) {
      logger.info(
        `[back-in-stock] Restock check ${event.data.id}: ${outcome.notified} notified` +
          (outcome.failed ? `, ${outcome.failed} failed` : "")
      )
    }
  } catch (error) {
    logger.error(
      `[back-in-stock] Stock check ${event.data?.id} failed: ${(error as Error).message}. It will be retried.`
    )
  }
}

export const config: SubscriberConfig = {
  event: BackInStockEvents.CHECK_DUE,
  context: { subscriberId: "back-in-stock-check-due" },
}
