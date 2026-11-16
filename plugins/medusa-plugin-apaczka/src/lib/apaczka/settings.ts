import { z } from "@medusajs/framework/zod"

/** Settings staff change on the Settings tab, stored in the database. */
export const settingsSchema = z.object({
  /**
   * When a product in the shipment has no weight, do not create the shipment
   * automatically: leave it pending on the order, with the reason, for
   * someone to check the parcel and create it by hand.
   */
  hold_without_weight: z.boolean().default(false),
})

export type ApaczkaSettings = z.output<typeof settingsSchema>

export const DEFAULT_SETTINGS: ApaczkaSettings = settingsSchema.parse({})

export function readSettings(value: unknown): ApaczkaSettings {
  const parsed = settingsSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

/** Stored as the reason of a held shipment; the admin translates it. */
export const MISSING_WEIGHT_REASON = "missing_weight"
