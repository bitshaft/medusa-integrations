import { discountBasisPoints } from "./money"
import { threadExpiresAt } from "./expiry"
import type { Actor, Author, CustomerSnapshot, MessageType, Offer, Status, ThreadKind, ThreadLine, Turn } from "./types"

/** A thread as stored. Amounts are integers in minor units of `currency_code`. */
export type ThreadRecord = {
  id: string
  number: string
  is_demo: boolean
  customer_id: string
  customer: CustomerSnapshot
  kind: ThreadKind
  lines: ThreadLine[]
  currency_code: string
  tax_inclusive: boolean
  region_id: string | null
  source_cart_id: string | null
  product_id: string | null
  variant_id: string | null
  quantity_total: number
  catalog_total: number
  target: Offer
  target_total: number
  offer: Offer | null
  offer_total: number | null
  offer_expires_at: Date | null
  accepted: Offer | null
  accepted_total: number | null
  accepted_by: "customer" | "team" | null
  accepted_at: Date | null
  accepted_until: Date | null
  status: Status
  turn: Turn
  assignee_id: string | null
  version: number
  last_activity_at: Date
  last_author: Author
  first_team_reply_at: Date | null
  closed_at: Date | null
  draft_order_id: string | null
  order_id: string | null
  created_at: Date
  updated_at: Date
}

export type MessageRecord = {
  id: string
  thread_id: string
  author: Author
  author_id: string | null
  type: MessageType
  body: string | null
  price: Offer | null
  price_total: number | null
  internal: boolean
  created_at: Date
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** The price currently on the table: the accepted one, else our offer, else the customer's target. */
export function currentPrice(t: ThreadRecord): number {
  return t.accepted_total ?? t.offer_total ?? t.target_total
}

/** Public parts of a message. Internal notes never pass this function. */
export function customerMessage(m: MessageRecord) {
  return {
    id: m.id,
    author: m.author,
    type: m.type,
    body: m.body,
    price: m.price,
    created_at: iso(m.created_at),
  }
}

/**
 * A thread as the customer sees it. Built from an explicit list of fields,
 * so internal notes, the assignee, minimum prices and the team's
 * bookkeeping cannot leak through it.
 */
export function customerView(
  t: ThreadRecord,
  messages: MessageRecord[] | null,
  ctx: { expiryDays: number; customerAccept: boolean; cartWriter: boolean; now?: Date }
) {
  const now = ctx.now ?? new Date()
  const active = t.status === "open" || t.status === "countered"
  const acceptedValid = t.status === "accepted" && !!t.accepted_until && t.accepted_until.getTime() > now.getTime()
  return {
    id: t.id,
    number: t.number,
    kind: t.kind,
    status: t.status,
    /** "customer" means the customer's move. */
    turn: t.turn,
    version: t.version,
    currency_code: t.currency_code,
    tax_inclusive: t.tax_inclusive,
    lines: t.lines.map((l) => ({
      variant_id: l.variant_id,
      product_id: l.product_id,
      product_title: l.product_title,
      variant_title: l.variant_title,
      sku: l.sku,
      thumbnail: l.thumbnail,
      quantity: l.quantity,
      catalog_unit_price: l.catalog_unit_price,
    })),
    catalog_total: t.catalog_total,
    target: t.target,
    offer: t.offer && t.status === "countered" ? { ...t.offer, expires_at: iso(t.offer_expires_at) } : null,
    accepted: t.accepted
      ? { ...t.accepted, by: t.accepted_by, at: iso(t.accepted_at), until: iso(t.accepted_until) }
      : null,
    expires_at: active ? iso(threadExpiresAt(t.last_activity_at, ctx.expiryDays)) : null,
    last_activity_at: iso(t.last_activity_at),
    created_at: iso(t.created_at),
    closed_at: iso(t.closed_at),
    can: {
      reply: active,
      accept: t.status === "countered" && ctx.customerAccept,
      withdraw: active,
      add_to_cart: acceptedValid && ctx.cartWriter && !t.order_id && !t.is_demo,
    },
    ...(messages ? { messages: messages.filter((m) => !m.internal).map(customerMessage) } : {}),
  }
}

export type CustomerView = ReturnType<typeof customerView>

/** A thread as the team sees it, with internal notes and bookkeeping. */
export function teamView(t: ThreadRecord, ctx: { expiryDays: number }) {
  const price = currentPrice(t)
  return {
    ...t,
    offer_expires_at: iso(t.offer_expires_at),
    accepted_at: iso(t.accepted_at),
    accepted_until: iso(t.accepted_until),
    last_activity_at: iso(t.last_activity_at),
    first_team_reply_at: iso(t.first_team_reply_at),
    closed_at: iso(t.closed_at),
    created_at: iso(t.created_at),
    updated_at: iso(t.updated_at),
    expires_at:
      t.status === "open" || t.status === "countered" ? iso(threadExpiresAt(t.last_activity_at, ctx.expiryDays)) : null,
    current_price: price,
    discount_bp: discountBasisPoints(price, t.catalog_total),
  }
}

export function teamMessage(m: MessageRecord) {
  return { ...m, created_at: iso(m.created_at) }
}

/** Event names. Payloads are described in the README. */
export const NegotiationEvents = {
  CREATED: "negotiation.created",
  MESSAGE_ADDED: "negotiation.message_added",
  COUNTER_OFFERED: "negotiation.counter_offered",
  ACCEPTED: "negotiation.accepted",
  REJECTED: "negotiation.rejected",
  EXPIRED: "negotiation.expired",
  WITHDRAWN: "negotiation.withdrawn",
  DRAFT_ORDER_CREATED: "negotiation.draft_order_created",
  ADDED_TO_CART: "negotiation.added_to_cart",
} as const
export type NegotiationEvent = (typeof NegotiationEvents)[keyof typeof NegotiationEvents]

/** The customer view without `can`: what a customer may do depends on the request, not on the event. */
function eventThread(t: ThreadRecord, expiryDays: number) {
  const view: Partial<CustomerView> = customerView(t, null, { expiryDays, customerAccept: false, cartWriter: false })
  delete view.can
  return view as Omit<CustomerView, "can">
}

/**
 * One payload shape for every event.
 *
 * - `audience` is "customer" when the event may be told to the customer
 *   (an e-mail), "team" when it is internal (an internal note).
 * - `customer` holds only what may be shown to the customer: the same
 *   fields as the Store API, plus the message. It is `null` for team events.
 * - `team` holds the bookkeeping for CRM or ERP: assignee, totals, the note.
 */
export function eventPayload(
  t: ThreadRecord,
  input: { actor: Actor; message?: MessageRecord | null; extra?: Record<string, unknown>; expiryDays: number }
) {
  const message = input.message ?? null
  const internal = Boolean(message?.internal)
  return {
    id: t.id,
    number: t.number,
    kind: t.kind,
    status: t.status,
    turn: t.turn,
    customer_id: t.customer_id,
    currency_code: t.currency_code,
    is_demo: t.is_demo,
    actor: input.actor,
    audience: internal ? ("team" as const) : ("customer" as const),
    message_id: message?.id ?? null,
    team: {
      assignee_id: t.assignee_id,
      catalog_total: t.catalog_total,
      target_total: t.target_total,
      offer_total: t.offer_total,
      accepted_total: t.accepted_total,
      customer: t.customer,
      note: internal ? message!.body : null,
      ...(input.extra ?? {}),
    },
    customer: internal
      ? null
      : {
          thread: eventThread(t, input.expiryDays),
          message: message ? customerMessage(message) : null,
          ...(input.extra ?? {}),
        },
  }
}

export type EventPayload = ReturnType<typeof eventPayload>
