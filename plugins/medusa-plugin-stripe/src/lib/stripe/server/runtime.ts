import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { STRIPE_MODULE } from "../../../modules/stripe"
import type StripeModuleService from "../../../modules/stripe/service"

export function resolveStripe(container: MedusaContainer): StripeModuleService {
  return container.resolve<StripeModuleService>(STRIPE_MODULE)
}

type GraphResult = { data: Array<Record<string, any>> }

/** `query.graph`, typed loosely: the plugin reads fields across modules and links. */
export function graph(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (config: Record<string, unknown>) => Promise<GraphResult>
  }
  return (config: Record<string, unknown>) => query.graph(config)
}
