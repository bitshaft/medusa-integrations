import type { IEventBusModuleService, Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { LOYALTY_MODULE } from "../../../modules/loyalty"
import type LoyaltyModuleService from "../../../modules/loyalty/service"

export function resolveLoyalty(container: MedusaContainer): LoyaltyModuleService {
  return container.resolve<LoyaltyModuleService>(LOYALTY_MODULE)
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

/** Events other plugins (emails, newsletter) listen to. Payloads are documented in the README. */
export const LoyaltyEvents = {
  POINTS_EARNED: "loyalty.points_earned",
  POINTS_REDEEMED: "loyalty.points_redeemed",
  POINTS_REVERTED: "loyalty.points_reverted",
  POINTS_EXPIRING: "loyalty.points_expiring",
  POINTS_EXPIRED: "loyalty.points_expired",
  TIER_CHANGED: "loyalty.tier_changed",
  REWARD_REDEEMED: "loyalty.reward_redeemed",
} as const

export async function emit(container: MedusaContainer, name: string, data: Record<string, unknown>) {
  await container.resolve<IEventBusModuleService>(Modules.EVENT_BUS).emit({ name, data })
}

/** The program is on and the plugin options are valid. */
export async function programRunning(container: MedusaContainer): Promise<boolean> {
  const service = resolveLoyalty(container)
  return (await service.isEnabled()) && (await service.getSettings()).enabled
}

export type Membership = { member: true } | { member: false; reason: "guest" | "excluded" | "not_found" }

/**
 * Who takes part: every customer with an account, except customers in an
 * excluded group. Guests collect nothing.
 */
export async function membership(
  container: MedusaContainer,
  customerId: string | null | undefined,
  excludedGroups: string[]
): Promise<Membership> {
  if (!customerId) return { member: false, reason: "guest" }
  const { data } = await graph(container)({
    entity: "customer",
    fields: ["id", "has_account", "groups.id"],
    filters: { id: customerId },
  })
  const customer = data[0]
  if (!customer) return { member: false, reason: "not_found" }
  if (!customer.has_account) return { member: false, reason: "guest" }
  const groups = ((customer.groups ?? []) as Array<{ id: string } | null>).filter(Boolean).map((g) => g!.id)
  if (groups.some((id) => excludedGroups.includes(id))) return { member: false, reason: "excluded" }
  return { member: true }
}
