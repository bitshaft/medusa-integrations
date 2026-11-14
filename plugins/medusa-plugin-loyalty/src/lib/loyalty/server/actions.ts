import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { birthdayLockedUntil, parseBirthday } from "../birthday"
import { formatDate } from "../format"
import { LoyaltyError } from "../messages"
import type { Locale } from "../types"
import { emit, graph, LoyaltyEvents, membership, resolveLoyalty } from "./runtime"

type ActionName = "signup" | "newsletter"

/**
 * Points for a one-off action (sign-up, newsletter). Once per customer,
 * guaranteed by the entry key. Returns the points added (0 when skipped).
 */
export async function awardAction(
  container: MedusaContainer,
  customerId: string,
  action: ActionName,
  actor: { type: "system" | "admin"; id?: string | null } = { type: "system" }
): Promise<number> {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return 0
  const settings = await service.getSettings()
  const rule = settings.actions[action]
  if (!settings.enabled || !rule.enabled || rule.points <= 0) return 0
  const member = await membership(container, customerId, settings.excluded_group_ids)
  if (!member.member) return 0
  const result = await service.post(customerId, [
    {
      key: `${action}:${customerId}`,
      type: "action",
      reason: action,
      points: rule.points,
      actor_type: actor.type,
      actor_id: actor.id ?? null,
    },
  ])
  if (!result.created.length) return 0
  await emit(container, LoyaltyEvents.POINTS_EARNED, {
    customer_id: customerId,
    points: rule.points,
    reason: action,
    balance: result.balance,
  })
  return rule.points
}

/** The customer for a newsletter event: by `customer_id`, or by e-mail among customers with an account. */
export async function customerForNewsletter(
  container: MedusaContainer,
  data: { customer_id?: unknown; email?: unknown }
): Promise<string | null> {
  if (typeof data.customer_id === "string" && data.customer_id) return data.customer_id
  if (typeof data.email !== "string" || !data.email.includes("@")) return null
  const { data: customers } = await graph(container)({
    entity: "customer",
    fields: ["id", "has_account"],
    filters: { email: data.email.trim().toLowerCase() },
  })
  return customers.find((c) => c.has_account)?.id ?? null
}

/**
 * Sets the birthday of a signed-in customer. A date can be changed once
 * per `change_interval_days` (setting), so it cannot be moved around for
 * repeated bonuses.
 */
export async function setBirthday(
  container: MedusaContainer,
  customerId: string,
  value: string,
  locale: Locale,
  now = new Date()
) {
  const service = resolveLoyalty(container)
  const [settings, options] = await Promise.all([service.getSettings(), service.getOptions()])
  if (!parseBirthday(value)) throw new LoyaltyError("birthday_invalid")
  const account = await service.getAccount(customerId)
  if (account?.birthday === value.trim()) return account
  const lockedUntil = account?.birthday
    ? birthdayLockedUntil(account.birthday_set_at, settings.actions.birthday, now)
    : null
  if (lockedUntil) {
    throw new LoyaltyError("birthday_locked", { date: formatDate(lockedUntil, locale, options.timeZone) })
  }
  return service.updateAccount(customerId, { birthday: value.trim(), birthday_set_at: now })
}

/**
 * A manual correction by an admin: any whole number of points, with a
 * required reason. Recorded with the admin user, like every entry.
 */
export async function adjustPoints(
  container: MedusaContainer,
  input: { customer_id: string; points: number; reason: string; admin_id: string | null; request_id: string }
) {
  if (!Number.isInteger(input.points) || input.points === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Points must be a whole number other than 0.")
  }
  if (!input.reason.trim()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A reason is required for a manual correction.")
  }
  const service = resolveLoyalty(container)
  const result = await service.post(input.customer_id, [
    {
      // The request id makes a double-submitted form write once.
      key: `manual:${input.request_id}`,
      type: "adjustment",
      reason: "manual",
      points: input.points,
      description: input.reason.trim(),
      actor_type: "admin",
      actor_id: input.admin_id,
    },
  ])
  if (result.created.length) {
    await emit(container, input.points > 0 ? LoyaltyEvents.POINTS_EARNED : LoyaltyEvents.POINTS_REVERTED, {
      customer_id: input.customer_id,
      points: input.points,
      reason: "manual",
      balance: result.balance,
    })
  }
  return result
}
