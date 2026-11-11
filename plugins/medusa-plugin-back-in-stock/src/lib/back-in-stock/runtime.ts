import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { BACK_IN_STOCK_MODULE } from "../../modules/back-in-stock"
import type BackInStockModuleService from "../../modules/back-in-stock/service"
import { loadAvailability } from "./availability"
import { loadProducts, loadStoreName } from "./catalog"
import { deliverEmail } from "./deliver"
import type { EngineDependencies } from "./engine"

export function resolveBackInStock(container: MedusaContainer): BackInStockModuleService {
  return container.resolve<BackInStockModuleService>(BACK_IN_STOCK_MODULE)
}

/** The engine's dependencies, wired to Medusa. Null when the plugin is disabled. */
export async function engineFor(container: MedusaContainer): Promise<EngineDependencies | null> {
  const service = resolveBackInStock(container)
  if (!(await service.isEnabled())) {
    return null
  }
  const options = await service.getOptions()
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  return {
    store: service,
    options,
    logger,
    settings: () => service.getSettings(),
    availability: (variantIds, salesChannelId, minQuantity) =>
      loadAvailability(container, variantIds, salesChannelId, minQuantity),
    products: (variantIds) => loadProducts(container, variantIds),
    storeName: () => loadStoreName(container),
    deliver: (input) => deliverEmail(container, options, logger, input),
    emit: async (name, data, delayMs) => {
      await container.resolve(Modules.EVENT_BUS).emit({ name, data }, delayMs ? { delay: delayMs } : {})
    },
  }
}
