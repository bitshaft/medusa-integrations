import { model } from "@medusajs/framework/utils"

/**
 * A stock check waiting for its delay to pass. This table is the record of
 * work to do; the delayed `back-in-stock.check.due` event is only the timer.
 *
 * - One row per variant and sales channel: events within the delay collapse.
 * - `due_at` is set by the first event and never moved, so a stream of edits
 *   cannot postpone the check forever.
 * - `claimed_at` is set by the worker running the check; the row is deleted
 *   only after the check and its emails are done. A claim older than a few
 *   minutes is stale (the worker crashed) and the row is run again.
 * - `dirty_at` records events that arrive while the check runs; such a row
 *   is scheduled again instead of being deleted.
 */
export const BackInStockPendingCheck = model
  .define("back_in_stock_pending_check", {
    id: model.id({ prefix: "bichk" }).primaryKey(),
    variant_id: model.text(),
    sales_channel_id: model.text(),
    due_at: model.dateTime(),
    claimed_at: model.dateTime().nullable(),
    dirty_at: model.dateTime().nullable(),
    /** Run even without a stock change and outside the gap rule (demo "simulate restock"). */
    forced: model.boolean().default(false),
  })
  .indexes([
    {
      name: "IDX_bis_pending_check_unique",
      on: ["variant_id", "sales_channel_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_bis_pending_check_due_at", on: ["due_at"], where: "deleted_at IS NULL" },
  ])
