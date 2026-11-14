import { model } from "@medusajs/framework/utils"

import { ACTOR_TYPES, ENTRY_REASONS, ENTRY_TYPES } from "../../../lib/loyalty/types"

/**
 * The points ledger. Rows are never changed or deleted (a database trigger
 * refuses it); mistakes are fixed with a correcting entry. `key` makes every
 * write idempotent: the same event can never add points twice.
 */
export const LoyaltyEntry = model
  .define("loyalty_entry", {
    id: model.id({ prefix: "lent" }).primaryKey(),
    account_id: model.text(),
    customer_id: model.text(),
    type: model.enum([...ENTRY_TYPES]),
    reason: model.enum([...ENTRY_REASONS]),
    points: model.number(),
    key: model.text(),
    order_id: model.text().nullable(),
    reward_id: model.text().nullable(),
    redemption_id: model.text().nullable(),
    code: model.text().nullable(),
    description: model.text().nullable(),
    actor_type: model.enum([...ACTOR_TYPES]).default("system"),
    actor_id: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { name: "IDX_loyalty_entry_key_unique", on: ["key"], unique: true, where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_entry_account", on: ["account_id", "created_at"], where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_entry_customer", on: ["customer_id", "created_at"], where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_entry_order", on: ["order_id"], where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_entry_type_created", on: ["type", "created_at"], where: "deleted_at IS NULL" },
  ])
