import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { OLX_MODULE } from "../../modules/olx"
import type OlxModuleService from "../../modules/olx/service"
import { loadAvailability } from "./catalog"
import type { Engine } from "./engine"

export function resolveOlx(container: MedusaContainer): OlxModuleService {
  return container.resolve<OlxModuleService>(OLX_MODULE)
}

/** The engine for routes: throws the "disabled" error when the options are missing. */
export async function buildEngine(container: MedusaContainer): Promise<Engine> {
  const service = resolveOlx(container)
  return {
    store: service,
    api: await service.getApi(),
    logger: container.resolve(ContainerRegistrationKeys.LOGGER),
    safety: async () => (await service.getDefaults()).safety,
    availability: (ids) => loadAvailability(container, ids),
  }
}

/** The engine for jobs and subscribers: `null` (quietly) while disabled or not connected. */
export async function engineIfReady(container: MedusaContainer): Promise<Engine | null> {
  const service = resolveOlx(container)
  if (!(await service.isEnabled())) {
    return null
  }
  const connection = await service.describeConnection()
  return connection.connected && !connection.needs_reconnect ? buildEngine(container) : null
}
