import { model } from "@medusajs/framework/utils"

import { STATUSES, THREAD_KINDS } from "../../../lib/negotiations/types"

/**
 * A negotiation thread. Amount columns are integers in minor units
 * (bigint in the database). Every move is one conditional update on
 * `version` and `status`; see the module service.
 */
export const NegotiationThread = model
  .define("negotiation_thread", {
    id: model.id({ prefix: "negt" }).primaryKey(),
    number: model.text(),
    is_demo: model.boolean().default(false),
    customer_id: model.text(),
    /** Name, e-mail and company when the thread was sent (for the list and search). */
    customer: model.json(),
    kind: model.enum([...THREAD_KINDS]),
    /** Lines with quantities and catalog prices, frozen when the thread was sent. */
    lines: model.json(),
    currency_code: model.text(),
    tax_inclusive: model.boolean().default(false),
    region_id: model.text().nullable(),
    source_cart_id: model.text().nullable(),
    product_id: model.text().nullable(),
    variant_id: model.text().nullable(),
    quantity_total: model.number(),
    catalog_total: model.number(),
    target: model.json(),
    target_total: model.number(),
    offer: model.json().nullable(),
    offer_total: model.number().nullable(),
    offer_expires_at: model.dateTime().nullable(),
    accepted: model.json().nullable(),
    accepted_total: model.number().nullable(),
    accepted_by: model.text().nullable(),
    accepted_at: model.dateTime().nullable(),
    accepted_until: model.dateTime().nullable(),
    status: model.enum([...STATUSES]).default("open"),
    turn: model.text().nullable(),
    assignee_id: model.text().nullable(),
    version: model.number().default(1),
    last_activity_at: model.dateTime(),
    last_author: model.text(),
    first_team_reply_at: model.dateTime().nullable(),
    closed_at: model.dateTime().nullable(),
    draft_order_id: model.text().nullable(),
    order_id: model.text().nullable(),
    /** Lower-case number, customer, products and SKUs, for the admin search. */
    search_text: model.text(),
  })
  .indexes([
    { name: "IDX_negotiation_thread_number", on: ["number"], unique: true, where: "deleted_at IS NULL" },
    { name: "IDX_negotiation_thread_status", on: ["status", "last_activity_at"], where: "deleted_at IS NULL" },
    { name: "IDX_negotiation_thread_customer", on: ["customer_id", "created_at"], where: "deleted_at IS NULL" },
    { name: "IDX_negotiation_thread_product", on: ["product_id"], where: "deleted_at IS NULL" },
  ])
