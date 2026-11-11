import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { WHITELIST_VAT_MODULE } from "../modules/whitelist-vat"
import type WhitelistVatModuleService from "../modules/whitelist-vat/service"
import { verifyWhitelistVatOrderWorkflow } from "../workflows/whitelist-vat/verify-whitelist-vat-order"

/**
 * Verifies the buyer's tax ID when an order is placed, so every B2B order
 * has the registers' answers from the day of the sale. Orders without a
 * tax ID are left alone, and the order is never changed or blocked here.
 */
export default async function whitelistVatOrderPlaced({ event, container }: SubscriberArgs<{ id: string }>) {
  const service = container.resolve<WhitelistVatModuleService>(WHITELIST_VAT_MODULE)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!(await service.isEnabled()) || !(await service.getOptions()).orders.verifyOnPlaced) {
    return
  }
  try {
    await verifyWhitelistVatOrderWorkflow(container).run({ input: { order_id: event.data.id } })
  } catch (error) {
    logger.warn(
      `[whitelist-vat] Could not verify the tax ID of order ${event.data.id}: ${(error as Error).message}. ` +
        "Verify it from the order page."
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: { subscriberId: "whitelist-vat-order-placed" },
}
