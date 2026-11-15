import { z } from "@medusajs/framework/zod"

import { CART_COUNTER_MODES } from "./types"

/**
 * Settings the team changes in the admin (Settings tab), stored in the
 * database. Options from medusa-config are separate and read-only there.
 */
export const settingsSchema = z.object({
  /** Counter-offer modes on cart threads; changing it does not touch offers already sent. */
  cart_counter_modes: z.enum(CART_COUNTER_MODES).default("both"),
  /** Largest discount below the catalog price without a confirmation, in basis points (1250 = 12.5 %). */
  max_discount_bp: z.number().int().min(0).max(10_000).nullable().default(null),
  /** Writes after acceptance, armed by a person. They also need the matching `writers` option. */
  armed: z
    .object({ draft_orders: z.boolean().default(false), cart: z.boolean().default(false) })
    .default({ draft_orders: false, cart: false }),
})

export type NegotiationsSettings = z.output<typeof settingsSchema>

export const DEFAULT_SETTINGS: NegotiationsSettings = settingsSchema.parse({})

/** Stored settings, falling back to defaults for anything missing or invalid. */
export function readSettings(value: unknown): NegotiationsSettings {
  const parsed = settingsSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}
