import type { MedusaContainer } from "@medusajs/framework/types"

import { birthdayDue } from "../birthday"
import { expiresAt, isExpired, reminderDue } from "../points"
import type { LoyaltySettings } from "../settings"
import { emit, LoyaltyEvents, membership, resolveLoyalty } from "./runtime"
import { recomputeTier } from "./tiers"

const PAGE = 500

/** Every account matching `filters`, page by page. */
async function* accounts(container: MedusaContainer, filters: Record<string, unknown>) {
  const service = resolveLoyalty(container)
  for (let skip = 0; ; skip += PAGE) {
    const page = await service.listLoyaltyAccounts(filters, { take: PAGE, skip, order: { id: "ASC" } })
    for (const account of page) yield account
    if (page.length < PAGE) return
  }
}

/**
 * Daily: expires positive balances after the inactivity period (counted
 * from the last order or redemption, or from joining), and emits
 * `loyalty.points_expiring` once per period, `reminder_days` before.
 */
export async function expirePoints(container: MedusaContainer, settings: LoyaltySettings, now = new Date()) {
  const service = resolveLoyalty(container)
  const result = { expired: 0, reminded: 0 }
  if (!settings.expiry.enabled) return result
  for await (const account of accounts(container, { balance: { $gt: 0 } })) {
    const since = account.last_activity_at ? new Date(account.last_activity_at) : new Date(account.created_at)
    const at = expiresAt(since, settings.expiry)!
    if (isExpired(since, settings.expiry, now)) {
      const { expired, balance } = await service.expireBalance(
        account.customer_id,
        `expiry:${account.customer_id}:${since.toISOString()}`,
        "Inactivity"
      )
      if (expired > 0) {
        result.expired++
        await emit(container, LoyaltyEvents.POINTS_EXPIRED, {
          customer_id: account.customer_id,
          points: expired,
          balance,
          expired_at: now.toISOString(),
        })
      }
    } else if (reminderDue(since, settings.expiry, now) && account.reminded_for !== at.toISOString()) {
      await emit(container, LoyaltyEvents.POINTS_EXPIRING, {
        customer_id: account.customer_id,
        points: Number(account.balance),
        expires_at: at.toISOString(),
      })
      await service.updateAccount(account.customer_id, { reminded_for: at.toISOString() })
      result.reminded++
    }
  }
  return result
}

/** Daily: the birthday bonus, once a year, in the store's time zone. */
export async function grantBirthdays(
  container: MedusaContainer,
  settings: LoyaltySettings,
  timeZone: string,
  now = new Date()
) {
  const service = resolveLoyalty(container)
  const rule = settings.actions.birthday
  if (!settings.enabled || !rule.enabled || rule.points <= 0) return 0
  let granted = 0
  for await (const account of accounts(container, { birthday: { $ne: null } })) {
    const { due, year } = birthdayDue(
      { birthday: account.birthday, set_at: account.birthday_set_at ? new Date(account.birthday_set_at) : null },
      rule,
      now,
      timeZone
    )
    if (!due) continue
    if (!(await membership(container, account.customer_id, settings.excluded_group_ids)).member) continue
    const result = await service.post(account.customer_id, [
      {
        key: `birthday:${account.customer_id}:${year}`,
        type: "action",
        reason: "birthday",
        points: rule.points,
        description: String(year),
      },
    ])
    if (result.created.length) {
      granted++
      await emit(container, LoyaltyEvents.POINTS_EARNED, {
        customer_id: account.customer_id,
        points: rule.points,
        reason: "birthday",
        balance: result.balance,
      })
    }
  }
  return granted
}

/** Daily: tiers again, so customers drop when old orders leave the window. */
export async function recomputeAllTiers(container: MedusaContainer, settings: LoyaltySettings, now = new Date()) {
  let changed = 0
  for await (const account of accounts(container, {})) {
    if (!settings.tiers.levels.length && !account.tier_id) continue
    if ((await recomputeTier(container, account.customer_id, settings, now, "daily")).changed) changed++
  }
  return changed
}
