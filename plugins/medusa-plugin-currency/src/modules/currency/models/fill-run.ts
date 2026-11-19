import { model } from "@medusajs/framework/utils"

/** One "Fill prices": who, when, what for, at which rates, and what came of it. */
export const CurrencyFillRun = model
  .define("currency_fill_run", {
    id: model.id({ prefix: "curfill" }).primaryKey(),
    /** The admin user who saved it. */
    actor_id: model.text().nullable(),
    /** Their name or email at the time, so the history reads well after the user is gone. */
    actor_name: model.text().nullable(),
    /** Demo mode: computed and recorded, nothing written to prices. */
    demo: model.boolean().default(false),
    base_currency: model.text(),
    /** What was filled: `{ kind: "products" | "collection" | "category" | "demo", ids, labels }`. */
    scope: model.json(),
    /** The run's choices: `{ overwrite, priceLists, regionPrices, currencies }`. */
    run_options: model.json(),
    /** Per target currency: mode, rate, margin, effective rate, table number and date. */
    rates: model.json(),
    added: model.number().default(0),
    overwritten: model.number().default(0),
    skipped: model.number().default(0),
    /** Skipped prices by reason. */
    skipped_by: model.json(),
    /** Products touched, at most a few dozen ids with titles, for the history list. */
    products: model.json(),
  })
  .indexes([{ name: "IDX_currency_fill_run_created_at", on: ["created_at"], where: "deleted_at IS NULL" }])
