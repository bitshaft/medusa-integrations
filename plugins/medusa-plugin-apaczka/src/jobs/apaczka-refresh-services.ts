import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { listServices } from "../lib/apaczka"
import { APACZKA_MODULE } from "../modules/apaczka"
import type ApaczkaModuleService from "../modules/apaczka/service"

/**
 * Refreshes the cached service structure once a day, as Apaczka recommends,
 * so new or removed carriers show up without a restart.
 */
export default async function apaczkaRefreshServices(container: MedusaContainer) {
  const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const structure = await apaczka.getCatalog().getServiceStructure({ refresh: true })
    logger.info(`[apaczka] Service structure refreshed: ${listServices(structure).length} services`)
  } catch (error) {
    logger.warn(`[apaczka] Could not refresh the service structure: ${(error as Error).message}`)
  }
}

export const config = {
  name: "apaczka-refresh-services",
  schedule: "15 4 * * *",
}
