import type { IEventBusModuleService, Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { NEGOTIATIONS_MODULE } from "../../../modules/negotiations"
import type NegotiationsModuleService from "../../../modules/negotiations/service"
import type { NegotiationEvent } from "../views"

export function resolveNegotiations(container: MedusaContainer): NegotiationsModuleService {
  return container.resolve<NegotiationsModuleService>(NEGOTIATIONS_MODULE)
}

export function logger(container: MedusaContainer): Logger {
  return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
}

type GraphResult = { data: Array<Record<string, any>>; metadata?: { count?: number } }

/** `query.graph`, typed loosely: the plugin reads fields across modules and links. */
export function graph(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (config: Record<string, unknown>) => Promise<GraphResult>
  }
  return (config: Record<string, unknown>) => query.graph(config)
}

/** Emits after the database work is done; a failing subscriber never undoes a move. */
export async function emit(container: MedusaContainer, name: NegotiationEvent, data: Record<string, unknown>) {
  try {
    await container.resolve<IEventBusModuleService>(Modules.EVENT_BUS).emit({ name, data })
  } catch (error) {
    logger(container).warn(`[negotiations] Could not emit ${name}: ${(error as Error).message}`)
  }
}
