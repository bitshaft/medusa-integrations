import { z } from "@medusajs/framework/zod"

/**
 * Storefronts put the terms link in an `href`, so only web links are
 * accepted: `z.string().url()` alone would also take `javascript:` URLs.
 */
export const isWebUrl = (value: string) => /^https?:\/\/[^\s/]/i.test(value)

const action = (points: number) =>
  z
    .object({ enabled: z.boolean().default(false), points: z.number().int().min(0).max(1_000_000).default(points) })
    .prefault({})

export const tierSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i, "letters, digits, dashes or underscores"),
  name: z.string().trim().min(1).max(60),
  threshold: z.number().finite().min(0).max(100_000_000),
  multiplier: z.number().finite().min(0).max(10),
  bonus_points: z.number().int().min(0).max(1_000_000).default(0),
})

/**
 * Every rule of the program. The store owner changes all of it on the
 * Settings tab; these are the values a new store starts with. `prefault`
 * (not `default`) so zod 4 fills the inner defaults of a missing object.
 */
export const settingsSchema = z
  .object({
    /** Master switch: when off nothing is earned or redeemed, history stays. */
    enabled: z.boolean().default(true),
    /**
     * Currency of the amounts in the program (spend thresholds, reward
     * values). `null` follows the store's default currency in Medusa.
     */
    currency_code: z
      .string()
      .regex(/^[a-zA-Z]{3}$/, "a three-letter currency code")
      .transform((value) => value.toLowerCase())
      .nullable()
      .default(null),
    earn: z
      .object({
        /** `points` for every `per_amount` of the base: 1 point per 1 zł by default. */
        points: z.number().min(0).max(10_000).default(1),
        per_amount: z.number().positive().max(1_000_000).default(1),
        /** Items after discounts, with tax ("gross") or without ("net"). Shipping never counts. */
        base: z.enum(["gross", "net"]).default("gross"),
      })
      .prefault({}),
    actions: z
      .object({
        signup: action(50),
        first_order: action(100),
        birthday: z
          .object({
            enabled: z.boolean().default(false),
            points: z.number().int().min(0).max(1_000_000).default(100),
            /** A customer may change the date once in this many days. */
            change_interval_days: z.number().int().min(0).max(3650).default(365),
            /** The date must be set this many days before the birthday to earn the bonus. */
            min_days_before: z.number().int().min(0).max(365).default(30),
          })
          .prefault({}),
        newsletter: action(50),
      })
      .prefault({}),
    tiers: z
      .object({
        /** Spend counted over this many past months. */
        window_months: z.number().int().min(1).max(60).default(12),
        levels: z.array(tierSchema).max(20).default([]),
      })
      .prefault({}),
    expiry: z
      .object({
        enabled: z.boolean().default(true),
        /** Points expire after this many months without an order or a redemption. */
        months: z.number().int().min(1).max(120).default(12),
        /** Emit `loyalty.points_expiring` this many days before (0 = never). */
        reminder_days: z.number().int().min(0).max(365).default(30),
      })
      .prefault({}),
    rewards: z
      .object({
        /** Give points back for reward codes that expire unused. */
        return_points_on_code_expiry: z.boolean().default(true),
        /** A gift left in a cart that never becomes an order is removed and refunded after this many days. */
        gift_release_days: z.number().int().min(1).max(365).default(14),
      })
      .prefault({}),
    /** Customer groups that neither earn nor redeem (e.g. B2B). */
    excluded_group_ids: z.array(z.string().min(1)).max(200).default([]),
    /**
     * Other currencies of the store: `{ eur: 4.3 }` means 1 EUR counts as
     * 4.30 in the program currency (for points, tier spend and returns).
     * Orders in a currency without a rate earn nothing.
     */
    currency_rates: z
      .record(
        z.string().regex(/^[a-z]{3}$/, "a lower-case three-letter currency code"),
        z.number().positive().max(1_000_000)
      )
      .default({}),
    /** Link to the program terms, returned by the Store API. */
    terms_url: z.string().trim().url().refine(isWebUrl, "must start with http:// or https://").nullable().default(null),
  })
  .superRefine((settings, ctx) => {
    const ids = new Set<string>()
    const thresholds = new Set<number>()
    settings.tiers.levels.forEach((tier, index) => {
      if (ids.has(tier.id)) {
        ctx.addIssue({ code: "custom", path: ["tiers", "levels", index, "id"], message: "duplicate tier id" })
      }
      if (thresholds.has(tier.threshold)) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", "levels", index, "threshold"],
          message: "two tiers share a threshold",
        })
      }
      ids.add(tier.id)
      thresholds.add(tier.threshold)
    })
  })

export type LoyaltySettings = z.output<typeof settingsSchema>

export const DEFAULT_SETTINGS: LoyaltySettings = settingsSchema.parse({})

/** Stored settings on top of the defaults; anything unreadable falls back to the defaults. */
export function readSettings(stored: unknown): LoyaltySettings {
  const parsed = settingsSchema.safeParse(withoutUnsafeLinks(stored))
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

/**
 * A terms link stored before links had to be web links is dropped on its
 * own, so it does not send every other setting back to the defaults.
 */
function withoutUnsafeLinks(stored: unknown): unknown {
  if (!stored || typeof stored !== "object") return stored ?? {}
  const value = (stored as { terms_url?: unknown }).terms_url
  if (typeof value !== "string" || isWebUrl(value.trim())) return stored
  return { ...stored, terms_url: null }
}

/** Tiers from the lowest threshold up. */
export function sortedTiers(settings: Pick<LoyaltySettings, "tiers">) {
  return [...settings.tiers.levels].sort((a, b) => a.threshold - b.threshold)
}
