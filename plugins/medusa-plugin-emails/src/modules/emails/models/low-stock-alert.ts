import { model } from "@medusajs/framework/utils"

/**
 * An inventory item the store team has already been told about. The row is
 * removed when the item is restocked, so the next shortage alerts again.
 */
export const EmailsLowStockAlert = model
  .define("emails_low_stock_alert", {
    id: model.id({ prefix: "elsa" }).primaryKey(),
    inventory_item_id: model.text(),
    location_id: model.text(),
    /** Units available when the alert was sent. */
    available: model.number(),
  })
  .indexes([{ on: ["inventory_item_id", "location_id"], unique: true, where: "deleted_at IS NULL" }])
