import { model } from "@medusajs/framework/utils"

import { AUTHORS, MESSAGE_TYPES } from "../../../lib/negotiations/types"

/** One entry of a thread. Append-only: the database refuses updates and deletes (except demo rows). */
export const NegotiationMessage = model
  .define("negotiation_message", {
    id: model.id({ prefix: "negm" }).primaryKey(),
    thread_id: model.text(),
    author: model.enum([...AUTHORS]),
    author_id: model.text().nullable(),
    type: model.enum([...MESSAGE_TYPES]),
    body: model.text().nullable(),
    price: model.json().nullable(),
    price_total: model.number().nullable(),
    /** Internal notes: never sent to the customer. */
    internal: model.boolean().default(false),
    is_demo: model.boolean().default(false),
  })
  .indexes([
    { name: "IDX_negotiation_message_thread", on: ["thread_id", "created_at"], where: "deleted_at IS NULL" },
    { name: "IDX_negotiation_message_author", on: ["author_id", "created_at"], where: "deleted_at IS NULL" },
  ])
