import { model } from "@medusajs/framework/utils"

/**
 * The last known stock state of a variant in a sales channel. Notifications
 * go out only on a change from out of stock to in stock. A row exists only
 * for variants someone has subscribed to; subscribing records "out of stock".
 */
export const BackInStockVariantState = model
  .define("back_in_stock_variant_state", {
    id: model.id({ prefix: "bivst" }).primaryKey(),
    variant_id: model.text(),
    sales_channel_id: model.text(),
    in_stock: model.boolean().default(false),
    /** Units available at the last check; `null` when the variant is not stock-managed. */
    available: model.number().nullable(),
    /** `stock`, `untracked`, `backorder`, `no_inventory_item`, `missing`. */
    reason: model.text().nullable(),
    checked_at: model.dateTime(),
    restocked_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_bis_variant_state_unique",
      on: ["variant_id", "sales_channel_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])
