import { model } from "@medusajs/framework/utils"

/** History of the writers: every plan, dry run, write and error. */
export const NegotiationWriteRun = model
  .define("negotiation_write_run", {
    id: model.id({ prefix: "negr" }).primaryKey(),
    thread_id: model.text(),
    writer: model.enum(["draft_order", "cart"]),
    stage: model.enum(["plan", "dry_run", "commit", "error"]),
    actor_type: model.text(),
    actor_id: model.text().nullable(),
    input: model.json().nullable(),
    result: model.json().nullable(),
    error: model.text().nullable(),
  })
  .indexes([{ name: "IDX_negotiation_write_run_created", on: ["created_at"], where: "deleted_at IS NULL" }])
