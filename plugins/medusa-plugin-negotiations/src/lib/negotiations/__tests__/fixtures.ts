import type { ThreadLine } from "../types"
import type { MessageRecord, ThreadRecord } from "../views"

export const line = (variant: string, quantity: number, catalog: number): ThreadLine => ({
  variant_id: variant,
  product_id: `prod_${variant}`,
  product_title: `Product ${variant}`,
  variant_title: null,
  sku: `SKU-${variant}`,
  thumbnail: null,
  quantity,
  catalog_unit_price: catalog,
})

export function thread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  const lines = overrides.lines ?? [line("v1", 10, 10_000)]
  const now = new Date("2026-11-10T10:00:00Z")
  return {
    id: "negt_1",
    number: "NEG-2026-0001",
    is_demo: false,
    customer_id: "cus_1",
    customer: { email: "buyer@example.com", first_name: "Anna", last_name: "Nowak", company_name: "Budmax" },
    kind: "product",
    lines,
    currency_code: "pln",
    tax_inclusive: false,
    region_id: null,
    source_cart_id: null,
    product_id: lines[0].product_id,
    variant_id: lines[0].variant_id,
    quantity_total: 10,
    catalog_total: 100_000,
    target: { mode: "unit", lines: [{ variant_id: "v1", quantity: 10, unit_price: 8_000 }], total: 80_000 },
    target_total: 80_000,
    offer: null,
    offer_total: null,
    offer_expires_at: null,
    accepted: null,
    accepted_total: null,
    accepted_by: null,
    accepted_at: null,
    accepted_until: null,
    status: "open",
    turn: "team",
    assignee_id: "user_secret",
    version: 1,
    last_activity_at: now,
    last_author: "customer",
    first_team_reply_at: null,
    closed_at: null,
    draft_order_id: null,
    order_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

export const message = (overrides: Partial<MessageRecord> = {}): MessageRecord => ({
  id: "negm_1",
  thread_id: "negt_1",
  author: "customer",
  author_id: "cus_1",
  type: "message",
  body: "Hello",
  price: null,
  price_total: null,
  internal: false,
  created_at: new Date("2026-11-10T10:00:00Z"),
  ...overrides,
})
