import { model } from "@medusajs/framework/utils"

/**
 * A write made from an accepted thread: a draft order or lines in a cart.
 * Partial unique indexes allow one draft order per thread and one cart
 * write at a time, so two clicks or two requests never write twice.
 */
export const NegotiationWrite = model
  .define("negotiation_write", {
    id: model.id({ prefix: "negw" }).primaryKey(),
    thread_id: model.text(),
    kind: model.enum(["draft_order", "cart"]),
    /** pending → done; cart writes then become removed (lines taken out) or ordered. */
    status: model.enum(["pending", "done", "failed", "removed", "ordered"]),
    target_id: model.text().nullable(),
    line_item_ids: model.json().nullable(),
    actor_id: model.text().nullable(),
    error: model.text().nullable(),
  })
  .indexes([{ name: "IDX_negotiation_write_thread", on: ["thread_id", "kind"], where: "deleted_at IS NULL" }])
