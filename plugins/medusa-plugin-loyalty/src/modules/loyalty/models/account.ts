import { model } from "@medusajs/framework/utils"

/**
 * A customer's place in the program. `balance` is a cache of the ledger sum,
 * written in the same transaction as every entry; the ledger is the truth.
 */
export const LoyaltyAccount = model
  .define("loyalty_account", {
    id: model.id({ prefix: "lacc" }).primaryKey(),
    customer_id: model.text(),
    tier_id: model.text().nullable(),
    balance: model.number().default(0),
    /** Last order or redemption; points expire counted from here. */
    last_activity_at: model.dateTime().nullable(),
    /** `YYYY-MM-DD` or `--MM-DD`. Medusa customers have no birthday field. */
    birthday: model.text().nullable(),
    birthday_set_at: model.dateTime().nullable(),
    /** Expiry date the "points expiring" event was sent for, so it is sent once. */
    reminded_for: model.text().nullable(),
  })
  .indexes([
    { name: "IDX_loyalty_account_customer_unique", on: ["customer_id"], unique: true, where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_account_activity", on: ["last_activity_at"], where: "deleted_at IS NULL" },
  ])
