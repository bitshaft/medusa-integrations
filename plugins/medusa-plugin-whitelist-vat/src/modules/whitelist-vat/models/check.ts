import { model } from "@medusajs/framework/utils"

import { OUTCOMES } from "../../../lib/whitelist-vat/registers/types"

export const CHECK_SOURCES = ["mf", "gus", "vies", "local"] as const

/**
 * The verification history: one row per answer of one register, never
 * changed afterwards. `request_id` is the register's own identifier of the
 * answer, which is what proves due diligence for a given order and day.
 *
 * `local` rows record numbers rejected by the check-digit validation.
 * `from_cache` rows repeat a recent answer for another order without a new
 * request; they keep the original `checked_at` and `request_id`.
 */
export const WhitelistVatCheck = model
  .define("whitelist_vat_check", {
    id: model.id({ prefix: "wvchk" }).primaryKey(),
    number: model.text().searchable(),
    source: model.enum([...CHECK_SOURCES]),
    outcome: model.enum([...OUTCOMES]),
    /** The plugin's overall verdict when this answer was recorded. */
    status: model.text().nullable(),
    request_id: model.text().nullable(),
    error: model.text().nullable(),
    duration_ms: model.number().nullable(),
    from_cache: model.boolean().default(false),
    /** `checkout`, `order`, `admin`, `workflow`. */
    trigger_type: model.text().nullable(),
    /** Company name the register returned, for the history view. */
    name: model.text().nullable(),
    order_id: model.text().nullable(),
    customer_id: model.text().nullable(),
    cart_id: model.text().nullable(),
    checked_at: model.dateTime(),
  })
  .indexes([
    { on: ["number"], where: "deleted_at IS NULL" },
    { on: ["order_id"], where: "deleted_at IS NULL AND order_id IS NOT NULL" },
    { on: ["customer_id"], where: "deleted_at IS NULL AND customer_id IS NOT NULL" },
    { on: ["source", "checked_at"], where: "deleted_at IS NULL" },
  ])
