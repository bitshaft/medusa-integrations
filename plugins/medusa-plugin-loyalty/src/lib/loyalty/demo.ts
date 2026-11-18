import { addMonths } from "./points"
import { type LoyaltySettings, settingsSchema, sortedTiers } from "./settings"
import type { EarnMetadata, ReturnMetadata } from "./spend"
import type { ActorType, EntryReason, EntryType, RedemptionStatus, RewardKind } from "./types"

/**
 * Test data for demo mode: a program with every rule switched on, a reward
 * of every kind, and a year of history for up to eight customers, so every
 * screen has something to show: tiers and tier changes, points for orders
 * and actions, returns and cancellations, redemptions in every status,
 * expired points, points about to expire, manual corrections, birthdays.
 *
 * Pure: the caller supplies customers, IDs and the clock, and writes the
 * result. Entry keys follow the plugin's own formats (`signup:<customer>`,
 * `order:<id>:earn`…), so the real program never pays the same thing twice
 * on top of the demo.
 */

export type DemoInput = {
  now: Date
  /** Medusa customer IDs, oldest first. One profile each; extra profiles are left out. */
  customers: string[]
  /** A product variant for the gift reward; without one there is no gift reward. */
  giftVariantId: string | null
  /** Program currency, for the amount reward. */
  currency: string
  /** Current settings: the store-specific parts (currency, rates, groups, terms) are kept. */
  current: LoyaltySettings
  /** The admin restoring the demo, as the author of manual corrections. */
  actorId: string | null
  /** ID generator, e.g. `generateEntityId(undefined, prefix)`. */
  id: (prefix: string) => string
}

export type DemoReward = {
  id: string
  name: string
  description: string | null
  kind: RewardKind
  value: number | null
  currency_code: string | null
  variant_id: string | null
  cost: number
  active: boolean
  min_tier_id: string | null
  per_customer_limit: number | null
  code_valid_days: number | null
  created_at: Date
}

export type DemoAccount = {
  id: string
  customer_id: string
  tier_id: string | null
  balance: number
  last_activity_at: Date | null
  birthday: string | null
  birthday_set_at: Date | null
  created_at: Date
}

export type DemoEntry = {
  id: string
  account_id: string
  customer_id: string
  type: EntryType
  reason: EntryReason
  points: number
  key: string
  order_id: string | null
  reward_id: string | null
  redemption_id: string | null
  code: string | null
  description: string | null
  actor_type: ActorType
  actor_id: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
}

export type DemoRedemption = {
  id: string
  reward_id: string
  reward_name: string
  customer_id: string
  kind: RewardKind
  cost: number
  status: RedemptionStatus
  code: string | null
  promotion_id: string | null
  expires_at: Date | null
  cart_id: string | null
  variant_id: string | null
  order_id: string | null
  created_at: Date
}

export type DemoTierChange = {
  id: string
  customer_id: string
  from_tier_id: string | null
  to_tier_id: string | null
  spend: number
  trigger: string
  created_at: Date
}

export type DemoData = {
  settings: LoyaltySettings
  rewards: DemoReward[]
  accounts: DemoAccount[]
  entries: DemoEntry[]
  redemptions: DemoRedemption[]
  tier_changes: DemoTierChange[]
}

/** How many customers the demo uses at most. */
export const DEMO_PROFILES = 8

const DAY = 86_400_000

/** The program a demo shows: everything on. Store-specific settings stay as they are. */
export function demoSettings(current: LoyaltySettings): LoyaltySettings {
  return settingsSchema.parse({
    enabled: true,
    currency_code: current.currency_code,
    currency_rates: current.currency_rates,
    excluded_group_ids: current.excluded_group_ids,
    terms_url: current.terms_url,
    earn: { points: 1, per_amount: 1, base: "gross" },
    actions: {
      signup: { enabled: true, points: 50 },
      first_order: { enabled: true, points: 100 },
      birthday: { enabled: true, points: 100, change_interval_days: 365, min_days_before: 30 },
      newsletter: { enabled: true, points: 50 },
    },
    tiers: {
      window_months: 12,
      levels: [
        { id: "bronze", name: "Brąz", threshold: 0, multiplier: 1, bonus_points: 0 },
        { id: "silver", name: "Srebro", threshold: 1000, multiplier: 1.25, bonus_points: 100 },
        { id: "gold", name: "Złoto", threshold: 3000, multiplier: 1.5, bonus_points: 250 },
      ],
    },
    expiry: { enabled: true, months: 12, reminder_days: 30 },
    rewards: { return_points_on_code_expiry: true, gift_release_days: 14 },
  })
}

type RewardKey = "amount" | "percent" | "shipping" | "gift" | "retired"

/** One thing in a customer's history, `days` before now. */
type Event =
  | { days: number; kind: "signup" | "newsletter" | "birthday" }
  | { days: number; kind: "order"; amount: number }
  | { days: number; kind: "return"; order: number; amount: number }
  | { days: number; kind: "cancel"; order: number }
  | {
      days: number
      kind: "redeem"
      reward: RewardKey
      status: RedemptionStatus
      /** Points given back this many days later (released gift, code expired unused). */
      returned_after?: number
    }
  | { days: number; kind: "manual"; points: number; text: string }
  | { days: number; kind: "expire" }

type Profile = {
  /** `MM-DD` of the birthday, relative to today (days from now), or none. */
  birthday_in_days?: number
  events: Event[]
}

/** Eight customers, each showing a different part of the program. */
const PROFILES: Profile[] = [
  // A loyal customer: gold tier after a year of orders, codes used, a code waiting.
  {
    birthday_in_days: -40,
    events: [
      { days: 360, kind: "signup" },
      { days: 355, kind: "newsletter" },
      { days: 340, kind: "order", amount: 420 },
      { days: 300, kind: "order", amount: 650 },
      { days: 250, kind: "order", amount: 380 },
      { days: 200, kind: "order", amount: 890 },
      { days: 140, kind: "redeem", reward: "amount", status: "used" },
      { days: 150, kind: "order", amount: 540 },
      { days: 90, kind: "order", amount: 760 },
      { days: 40, kind: "birthday" },
      { days: 35, kind: "redeem", reward: "percent", status: "used" },
      { days: 28, kind: "order", amount: 430 },
      { days: 12, kind: "order", amount: 615 },
      { days: 3, kind: "redeem", reward: "shipping", status: "issued" },
    ],
  },
  // Silver tier, an unused discount code, a birthday coming up.
  {
    birthday_in_days: 10,
    events: [
      { days: 200, kind: "signup" },
      { days: 190, kind: "order", amount: 320 },
      { days: 120, kind: "order", amount: 480 },
      { days: 60, kind: "order", amount: 290 },
      { days: 20, kind: "order", amount: 350 },
      { days: 5, kind: "redeem", reward: "amount", status: "issued" },
    ],
  },
  // New this week: signup, newsletter and first order bonuses.
  {
    events: [
      { days: 6, kind: "signup" },
      { days: 5, kind: "newsletter" },
      { days: 4, kind: "order", amount: 189 },
    ],
  },
  // Points that expire in about two weeks: no order or redemption for almost a year.
  {
    events: [
      { days: 400, kind: "signup" },
      { days: 372, kind: "order", amount: 540 },
      { days: 352, kind: "order", amount: 310 },
    ],
  },
  // A partial return and a canceled order: points taken back.
  {
    events: [
      { days: 95, kind: "signup" },
      { days: 80, kind: "order", amount: 600 },
      { days: 70, kind: "return", order: 0, amount: 200 },
      { days: 30, kind: "order", amount: 250 },
      { days: 29, kind: "cancel", order: 1 },
    ],
  },
  // Gifts: one in a cart now, one ordered, one removed from a cart and refunded.
  {
    events: [
      { days: 110, kind: "signup" },
      { days: 100, kind: "order", amount: 900 },
      { days: 45, kind: "order", amount: 450 },
      { days: 40, kind: "redeem", reward: "gift", status: "ordered" },
      { days: 20, kind: "redeem", reward: "gift", status: "released", returned_after: 14 },
      { days: 2, kind: "redeem", reward: "gift", status: "in_cart" },
    ],
  },
  // Points expired after a year without activity; back since; a code expired unused and refunded.
  {
    events: [
      { days: 800, kind: "signup" },
      { days: 760, kind: "order", amount: 300 },
      { days: 395, kind: "expire" },
      { days: 60, kind: "order", amount: 520 },
      { days: 58, kind: "redeem", reward: "amount", status: "expired", returned_after: 30 },
      { days: 25, kind: "order", amount: 210 },
    ],
  },
  // Manual corrections by the team.
  {
    events: [
      { days: 150, kind: "signup" },
      { days: 145, kind: "newsletter" },
      { days: 130, kind: "order", amount: 260 },
      { days: 100, kind: "manual", points: 150, text: "Rekompensata za opóźnioną dostawę" },
      { days: 99, kind: "manual", points: -50, text: "Korekta: punkty naliczone podwójnie" },
    ],
  },
]

export function buildDemoData(input: DemoInput): DemoData {
  const { now, id } = input
  const settings = demoSettings(input.current)
  const tiers = sortedTiers(settings)
  const at = (days: number) => new Date(now.getTime() - days * DAY)
  const rewardsCreated = at(400)

  const reward = (
    key: RewardKey,
    data: Omit<DemoReward, "id" | "created_at" | "per_customer_limit" | "code_valid_days" | "min_tier_id" | "active"> &
      Partial<DemoReward>
  ): [RewardKey, DemoReward] => [
    key,
    {
      id: id("lrew"),
      active: true,
      min_tier_id: null,
      per_customer_limit: null,
      code_valid_days: null,
      created_at: rewardsCreated,
      ...data,
    },
  ]
  const rewardEntries: Array<[RewardKey, DemoReward]> = [
    reward("shipping", {
      name: "Darmowa dostawa",
      description: "Kod na darmową dostawę przy następnym zamówieniu.",
      kind: "free_shipping",
      value: null,
      currency_code: null,
      variant_id: null,
      cost: 250,
      code_valid_days: 30,
    }),
    reward("amount", {
      name: `Rabat 20 ${input.currency.toUpperCase()}`,
      description: "Kod rabatowy na kwotę, ważny 30 dni.",
      kind: "fixed",
      value: 20,
      currency_code: input.currency,
      variant_id: null,
      cost: 400,
      code_valid_days: 30,
    }),
    reward("percent", {
      name: "Rabat 10%",
      description: "Dla klientów z poziomem Srebro i wyżej.",
      kind: "percentage",
      value: 10,
      currency_code: null,
      variant_id: null,
      cost: 800,
      min_tier_id: "silver",
      code_valid_days: 30,
    }),
    reward("retired", {
      name: `Rabat 50 ${input.currency.toUpperCase()}`,
      description: "Wyłączona nagroda: nie da się jej już wymienić, historia zostaje.",
      kind: "fixed",
      value: 50,
      currency_code: input.currency,
      variant_id: null,
      cost: 1000,
      active: false,
      code_valid_days: 30,
    }),
  ]
  if (input.giftVariantId) {
    rewardEntries.push(
      reward("gift", {
        name: "Prezent do zamówienia",
        description: "Produkt dodawany do koszyka za punkty, raz na klienta w miesiącu.",
        kind: "gift",
        value: null,
        currency_code: null,
        variant_id: input.giftVariantId,
        cost: 600,
      })
    )
  }
  const rewards = new Map(rewardEntries)

  const data: DemoData = {
    settings,
    rewards: [...rewards.values()],
    accounts: [],
    entries: [],
    redemptions: [],
    tier_changes: [],
  }

  input.customers.slice(0, PROFILES.length).forEach((customerId, index) => {
    const profile = PROFILES[index]
    const accountId = id("lacc")
    const entries: DemoEntry[] = []
    const orders: Array<{ id: string; amount: number; days: number; points: number }> = []
    let balance = 0
    let tier: string | null = null
    let lastActivity: Date | null = null
    const reached = new Set<string>()

    const add = (
      entry: Omit<DemoEntry, "id" | "account_id" | "customer_id" | "actor_type" | "actor_id"> &
        Partial<Pick<DemoEntry, "actor_type" | "actor_id">>
    ) => {
      entries.push({
        id: id("lent"),
        account_id: accountId,
        customer_id: customerId,
        actor_type: "system",
        actor_id: null,
        ...entry,
      })
      balance += entry.points
    }
    const spendAt = (days: number) => {
      const since = addMonths(at(days), -settings.tiers.window_months).getTime()
      return orders
        .filter((order) => at(order.days).getTime() >= since && order.days >= days)
        .reduce((sum, order) => sum + order.amount, 0)
    }
    const updateTier = (days: number, trigger: string) => {
      const spend = spendAt(days)
      const next = [...tiers].reverse().find((t) => spend >= t.threshold)?.id ?? null
      if (next === tier) return
      data.tier_changes.push({
        id: id("ltch"),
        customer_id: customerId,
        from_tier_id: tier,
        to_tier_id: next,
        spend,
        trigger,
        created_at: at(days),
      })
      const level = tiers.find((t) => t.id === next)
      if (level && level.bonus_points > 0 && !reached.has(level.id)) {
        add({
          type: "tier_bonus",
          reason: "tier_bonus",
          points: level.bonus_points,
          key: `tier_bonus:${customerId}:${level.id}`,
          order_id: null,
          reward_id: null,
          redemption_id: null,
          code: null,
          description: level.name,
          metadata: null,
          created_at: at(days),
        })
      }
      if (next) reached.add(next)
      tier = next
    }

    const events = [...profile.events].sort((a, b) => b.days - a.days)
    let orderNumber = 0
    for (const event of events) {
      const when = at(event.days)
      const base = {
        order_id: null,
        reward_id: null,
        redemption_id: null,
        code: null,
        metadata: null,
        created_at: when,
      }
      if (event.kind === "signup" || event.kind === "newsletter") {
        add({
          ...base,
          type: "action",
          reason: event.kind,
          points: settings.actions[event.kind].points,
          key: `${event.kind}:${customerId}`,
          description: null,
        })
        if (event.kind === "signup") updateTier(event.days, "signup")
      } else if (event.kind === "birthday") {
        add({
          ...base,
          type: "action",
          reason: "birthday",
          points: settings.actions.birthday.points,
          key: `birthday:${customerId}:${when.getUTCFullYear()}`,
          description: null,
        })
      } else if (event.kind === "order") {
        orderNumber += 1
        const orderId = `order_demo_${index + 1}_${orderNumber}`
        const multiplier = tiers.find((t) => t.id === tier)?.multiplier ?? 1
        const points = Math.floor((event.amount * settings.earn.points * multiplier) / settings.earn.per_amount)
        const metadata: EarnMetadata = {
          base_total: event.amount,
          // Three units of one line, so a return can take back part of it.
          lines: [{ id: `item_demo_${index + 1}_${orderNumber}`, quantity: 3, base: event.amount }],
          multiplier,
          mode: "gross",
        }
        add({
          ...base,
          type: "order",
          reason: "earn",
          points,
          key: `order:${orderId}:earn`,
          order_id: orderId,
          description: `#${1000 + index * 10 + orderNumber}`,
          metadata: metadata as unknown as Record<string, unknown>,
        })
        if (orderNumber === 1) {
          add({
            ...base,
            type: "action",
            reason: "first_order",
            points: settings.actions.first_order.points,
            key: `first_order:${customerId}`,
            description: null,
          })
        }
        orders.push({ id: orderId, amount: event.amount, days: event.days, points })
        lastActivity = when
        updateTier(event.days, "order")
      } else if (event.kind === "return" || event.kind === "cancel") {
        const order = orders[event.order]
        const back =
          event.kind === "cancel"
            ? order.points
            : Math.min(order.points, Math.floor((order.points * event.amount) / order.amount))
        const metadata: ReturnMetadata | null =
          event.kind === "return"
            ? {
                returned: {
                  [`item_demo_${index + 1}_${event.order + 1}`]: Math.max(
                    1,
                    Math.round((3 * event.amount) / order.amount)
                  ),
                },
                returned_base: event.amount,
              }
            : null
        add({
          ...base,
          type: event.kind === "cancel" ? "order" : "return",
          reason: event.kind,
          points: -back,
          key: `order:${order.id}:${event.kind}:${back}`,
          order_id: order.id,
          description: null,
          metadata: metadata as unknown as Record<string, unknown> | null,
        })
        if (event.kind === "cancel") order.amount = 0
        else order.amount -= event.amount
        updateTier(event.days, event.kind)
      } else if (event.kind === "redeem") {
        const item = rewards.get(event.reward)
        if (!item) continue
        const redemptionId = id("lred")
        const isGift = item.kind === "gift"
        const code = isGift ? null : `DEMO-${redemptionId.slice(-6).toUpperCase()}`
        const validDays = item.code_valid_days ?? 30
        data.redemptions.push({
          id: redemptionId,
          reward_id: item.id,
          reward_name: item.name,
          customer_id: customerId,
          kind: item.kind,
          cost: item.cost,
          status: event.status,
          code,
          promotion_id: null,
          expires_at: isGift ? null : new Date(when.getTime() + validDays * DAY),
          cart_id: isGift && event.status !== "ordered" ? `cart_demo_${redemptionId.slice(-6)}` : null,
          variant_id: isGift ? item.variant_id : null,
          order_id:
            event.status === "used" || event.status === "ordered"
              ? `order_demo_${index + 1}_r${redemptionId.slice(-4)}`
              : null,
          created_at: when,
        })
        add({
          ...base,
          type: "redemption",
          reason: "redeem",
          points: -item.cost,
          key: `redeem:${redemptionId}`,
          reward_id: item.id,
          redemption_id: redemptionId,
          code,
          description: item.name,
          actor_type: "customer",
          actor_id: customerId,
        })
        lastActivity = when
        if (event.returned_after != null) {
          add({
            ...base,
            type: "redemption",
            reason: "redeem_returned",
            points: item.cost,
            key: `redeem_returned:${redemptionId}`,
            reward_id: item.id,
            redemption_id: redemptionId,
            code,
            description: item.name,
            created_at: new Date(when.getTime() + event.returned_after * DAY),
          })
        }
      } else if (event.kind === "manual") {
        add({
          ...base,
          type: "adjustment",
          reason: "manual",
          points: event.points,
          key: `manual:${id("demo")}`,
          description: event.text,
          actor_type: "admin",
          actor_id: input.actorId,
        })
      } else if (event.kind === "expire") {
        add({
          ...base,
          type: "expiry",
          reason: "expired",
          points: -Math.max(0, balance),
          key: `expiry:${customerId}:${when.toISOString().slice(0, 10)}`,
          description: null,
        })
        // Spend older than the window no longer counts.
        for (const order of orders) order.amount = 0
        updateTier(event.days, "expiry")
      }
    }
    // Tier as of today: old orders may have left the window.
    updateTier(0, "schedule")

    const signup = events.find((event) => event.kind === "signup")
    const birthday =
      profile.birthday_in_days != null
        ? `--${new Date(now.getTime() + profile.birthday_in_days * DAY).toISOString().slice(5, 10)}`
        : null
    data.accounts.push({
      id: accountId,
      customer_id: customerId,
      tier_id: tier,
      balance,
      last_activity_at: lastActivity,
      birthday,
      birthday_set_at: birthday ? at(330) : null,
      created_at: signup ? at(signup.days) : now,
    })
    data.entries.push(...entries)
  })

  return data
}
