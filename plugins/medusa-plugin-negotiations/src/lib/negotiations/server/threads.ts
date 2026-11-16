import type { MedusaContainer } from "@medusajs/framework/types"

import { acceptedUntil, checkOfferDeadline, defaultOfferDeadline } from "../expiry"
import { checkFloors, type FloorCheck } from "../floors"
import { checkBody, checkNewMessage, checkNewThread, checkQuantity } from "../limits"
import { NegotiationError } from "../messages"
import { catalogTotal } from "../money"
import { allowedOfferModes, buildOffer, buildTarget, type PriceInput } from "../offers"
import type { Actor, Offer, ThreadKind, ThreadLine } from "../types"
import { eventPayload, type MessageRecord, type NegotiationEvent, NegotiationEvents, type ThreadRecord } from "../views"
import {
  cartLines,
  cartTaxInclusive,
  customerCart,
  inAllowedGroup,
  loadCustomer,
  quoteProduct,
  snapshotOf,
} from "./catalog"
import { emit, resolveNegotiations } from "./runtime"

type Ctx = { container: MedusaContainer; now?: Date }

const service = (container: MedusaContainer) => resolveNegotiations(container)

export async function requireEnabled(container: MedusaContainer) {
  const s = service(container)
  if (!(await s.isEnabled())) throw new NegotiationError("disabled")
  return s
}

export async function notify(
  container: MedusaContainer,
  event: NegotiationEvent,
  thread: ThreadRecord,
  actor: Actor,
  message: MessageRecord | null,
  extra?: Record<string, unknown>
) {
  const { expiryDays } = await service(container).getOptions()
  await emit(container, event, eventPayload(thread, { actor, message, extra, expiryDays }))
}

/** Lapses due counter-offers and expires stale threads, then tells subscribers. Safe to run any time. */
export async function sweep(container: MedusaContainer, now = new Date()) {
  const s = service(container)
  if (!(await s.isEnabled())) return { lapsed: 0, expired: 0 }
  const { expiryDays } = await s.getOptions()
  const result = await s.expire({ now, expiryDays })
  const system: Actor = { type: "system", id: null }
  for (const t of result.lapsed) {
    if (!result.expired.some((e) => e.id === t.id)) {
      await notify(container, NegotiationEvents.MESSAGE_ADDED, t, system, result.offerMessages[t.id] ?? null)
    }
  }
  for (const t of result.expired) {
    await notify(container, NegotiationEvents.EXPIRED, t, system, result.expiryMessages[t.id] ?? null)
  }
  return { lapsed: result.lapsed.length, expired: result.expired.length }
}

function searchText(number: string, customer: Record<string, unknown>, lines: ThreadLine[]): string {
  return [
    number,
    customer.email,
    customer.first_name,
    customer.last_name,
    customer.company_name,
    ...lines.flatMap((l) => [l.product_title, l.variant_title, l.sku]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

/* Customer ------------------------------------------------------------------ */

/** The customer behind a Store API call, refused when not signed in or not in an allowed group. */
export async function requireCustomer(container: MedusaContainer, customerId: string | null) {
  const s = await requireEnabled(container)
  if (!customerId) throw new NegotiationError("not_signed_in")
  const customer = await loadCustomer(container, customerId)
  if (!customer) throw new NegotiationError("not_signed_in")
  const { allowedCustomerGroups } = await s.getOptions()
  if (!inAllowedGroup(customer, allowedCustomerGroups)) throw new NegotiationError("group_not_allowed")
  return customer
}

/** A thread of this customer. Someone else's thread is "not found", never "forbidden". */
export async function customerThread(container: MedusaContainer, customerId: string, id: string) {
  const thread = await service(container).getThread(id)
  if (!thread || thread.customer_id !== customerId || thread.is_demo) throw new NegotiationError("not_found")
  return thread
}

export type OpenInput =
  | {
      kind: "product"
      variant_id?: string
      product_id?: string
      quantity: number
      target_unit_price: number
      region_id?: string
      currency_code?: string
      message?: string | null
    }
  | { kind: "cart"; cart_id: string; target_total: number; message?: string | null }

export async function openThread(ctx: Ctx, customerId: string | null, input: OpenInput) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const customer = await requireCustomer(container, customerId)
  const s = service(container)
  const options = await s.getOptions()
  checkNewThread(options.limits, await s.customerActivity(customer.id, now))
  const body = checkBody(options.limits, input.message)

  let kind: ThreadKind
  let lines: ThreadLine[]
  let currency: string
  let regionId: string | null
  // Net or gross as the customer saw the catalog price; the thread keeps it,
  // so the agreed price means the same in the cart and in a draft order.
  let taxInclusive: boolean
  let sourceCart: string | null = null
  let target: Offer
  if (input.kind === "product") {
    checkQuantity(options.limits, input.quantity)
    const quote = await quoteProduct(container, { ...input, customer })
    kind = "product"
    lines = [quote.line]
    currency = quote.currency_code
    regionId = quote.region_id
    taxInclusive = quote.price_tax_inclusive
    if (!(input.target_unit_price > 0)) throw new NegotiationError("price_required")
    target = buildTarget(kind, lines, input.target_unit_price)
  } else {
    const cart = await customerCart(container, input.cart_id, customer.id)
    kind = "cart"
    lines = cartLines(cart)
    for (const line of lines) checkQuantity(options.limits, line.quantity)
    currency = cart.currency_code
    regionId = cart.region_id
    taxInclusive = cartTaxInclusive(cart)
    sourceCart = cart.id
    target = buildTarget(kind, lines, input.target_total)
    if (target.total <= 0) throw new NegotiationError("price_required")
  }

  const number = await s.nextNumber(now.getUTCFullYear())
  const snapshot = snapshotOf(customer)
  const { thread, messages } = await s.insertThread(
    {
      number,
      is_demo: false,
      customer_id: customer.id,
      customer: snapshot,
      kind,
      lines,
      currency_code: currency,
      tax_inclusive: taxInclusive,
      region_id: regionId,
      source_cart_id: sourceCart,
      product_id: lines[0].product_id,
      variant_id: kind === "product" ? lines[0].variant_id : null,
      quantity_total: lines.reduce((sum, l) => sum + l.quantity, 0),
      catalog_total: catalogTotal(lines),
      target,
      target_total: target.total,
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
      assignee_id: null,
      last_activity_at: now,
      last_author: "customer",
      first_team_reply_at: null,
      closed_at: null,
      draft_order_id: null,
      order_id: null,
      search_text: searchText(number, snapshot, lines),
      created_at: now,
    },
    [{ author: "customer", author_id: customer.id, type: "target_price", body, price: target }]
  )
  await notify(container, NegotiationEvents.CREATED, thread, { type: "customer", id: customer.id }, messages[0])
  return { thread, messages }
}

export async function customerReply(
  ctx: Ctx,
  customerId: string | null,
  id: string,
  input: { version: number; message?: string | null; target_price?: number | null }
) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const customer = await requireCustomer(container, customerId)
  const s = service(container)
  const options = await s.getOptions()
  await sweep(container, now)
  const thread = await customerThread(container, customer.id, id)
  checkNewMessage(options.limits, await s.customerActivity(customer.id, now))
  const body = checkBody(options.limits, input.message)
  const actor: Actor = { type: "customer", id: customer.id }

  if (input.target_price !== undefined && input.target_price !== null) {
    if (!(input.target_price > 0)) throw new NegotiationError("price_required")
    const target = buildTarget(thread.kind, thread.lines, input.target_price)
    if (target.total <= 0) throw new NegotiationError("price_required")
    const result = await s.applyMove(id, {
      move: "customer_target",
      version: input.version,
      now,
      actor,
      patch: { target, target_total: target.total, offer: null, offer_total: null, offer_expires_at: null },
      message: { author: "customer", author_id: customer.id, type: "target_price", body, price: target },
    })
    await notify(container, NegotiationEvents.MESSAGE_ADDED, result.thread, actor, result.message)
    return result
  }
  if (!body) throw new NegotiationError("message_required")
  const result = await s.applyMove(id, {
    move: "customer_message",
    version: input.version,
    now,
    actor,
    message: { author: "customer", author_id: customer.id, type: "message", body },
  })
  await notify(container, NegotiationEvents.MESSAGE_ADDED, result.thread, actor, result.message)
  return result
}

/** The customer accepts the counter-offer at the price they saw. */
export async function customerAccept(
  ctx: Ctx,
  customerId: string | null,
  id: string,
  input: { version: number; price: number }
) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const customer = await requireCustomer(container, customerId)
  const s = service(container)
  const options = await s.getOptions()
  if (!options.customerAccept) throw new NegotiationError("customer_accept_off")
  await sweep(container, now)
  const thread = await customerThread(container, customer.id, id)
  if (thread.status !== "countered" || !thread.offer) {
    throw new NegotiationError(thread.status === "open" ? "price_changed" : "nothing_to_accept").withState(thread)
  }
  const actor: Actor = { type: "customer", id: customer.id }
  const result = await s.applyMove(id, {
    move: "customer_accept",
    version: input.version,
    now,
    actor,
    expectPrice: { column: "offer_total", value: input.price },
    patch: {
      accepted: thread.offer,
      accepted_total: thread.offer.total,
      accepted_by: "customer",
      accepted_at: now,
      accepted_until: acceptedUntil(now, options.acceptedOfferDays),
      closed_at: now,
    },
    message: { author: "customer", author_id: customer.id, type: "acceptance", price: thread.offer },
  })
  await notify(container, NegotiationEvents.ACCEPTED, result.thread, actor, result.message)
  return result
}

export async function customerWithdraw(
  ctx: Ctx,
  customerId: string | null,
  id: string,
  input: { version: number; message?: string | null }
) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const customer = await requireCustomer(container, customerId)
  const s = service(container)
  const options = await s.getOptions()
  await customerThread(container, customer.id, id)
  const actor: Actor = { type: "customer", id: customer.id }
  const result = await s.applyMove(id, {
    move: "customer_withdraw",
    version: input.version,
    now,
    actor,
    patch: { closed_at: now, offer: null, offer_total: null, offer_expires_at: null },
    message: {
      author: "customer",
      author_id: customer.id,
      type: "withdrawal",
      body: checkBody(options.limits, input.message),
    },
  })
  await notify(container, NegotiationEvents.WITHDRAWN, result.thread, actor, result.message)
  return result
}

/* Team ---------------------------------------------------------------------- */

export async function teamThread(container: MedusaContainer, id: string) {
  const thread = await (await requireEnabled(container)).getThread(id)
  if (!thread) throw new NegotiationError("not_found")
  return thread
}

/** Minimum prices of the thread's variants in its currency. */
export async function floorsOf(container: MedusaContainer, thread: ThreadRecord): Promise<Record<string, number>> {
  const floors = await service(container).getFloors(
    thread.lines.map((l) => l.variant_id),
    thread.currency_code
  )
  return Object.fromEntries(floors.map((f) => [f.variant_id, f.amount]))
}

/** The offer a price input would produce, with minimum price warnings. Nothing is saved. */
export async function previewOffer(
  container: MedusaContainer,
  thread: ThreadRecord,
  input: PriceInput
): Promise<{ offer: Offer; floors: FloorCheck; modes: string[] }> {
  const s = service(container)
  const settings = await s.getSettings()
  const modes = allowedOfferModes(thread.kind, settings.cart_counter_modes)
  if (!modes.includes(input.mode)) throw new NegotiationError("mode_not_allowed", { mode: input.mode })
  const offer = buildOffer(thread.lines, input)
  return {
    offer,
    floors: checkFloors(offer.lines, thread.lines, await floorsOf(container, thread), settings.max_discount_bp),
    modes,
  }
}

async function requireConfirmed(
  container: MedusaContainer,
  thread: ThreadRecord,
  offer: Offer,
  confirmed: boolean | undefined
) {
  const settings = await service(container).getSettings()
  const check = checkFloors(offer.lines, thread.lines, await floorsOf(container, thread), settings.max_discount_bp)
  if (check.needs_confirmation && !confirmed) {
    const error = new NegotiationError("below_floor")
    ;(error as NegotiationError & { floors?: FloorCheck }).floors = check
    throw error
  }
  return check
}

const userActor = (userId: string | null): Actor => ({ type: "user", id: userId })

export async function teamReply(
  ctx: Ctx,
  userId: string | null,
  id: string,
  input: { version: number; message: string }
) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const s = await requireEnabled(container)
  const options = await s.getOptions()
  await sweep(container, now)
  await teamThread(container, id)
  const body = checkBody(options.limits, input.message)
  if (!body) throw new NegotiationError("message_required")
  const result = await s.applyMove(id, {
    move: "team_message",
    version: input.version,
    now,
    actor: userActor(userId),
    message: { author: "team", author_id: userId, type: "message", body },
  })
  await notify(container, NegotiationEvents.MESSAGE_ADDED, result.thread, userActor(userId), result.message)
  return result
}

/** An internal note: only the team sees it; the version and activity stay. */
export async function teamNote(ctx: Ctx, userId: string | null, id: string, input: { message: string }) {
  const { container } = ctx
  const s = await requireEnabled(container)
  const options = await s.getOptions()
  await teamThread(container, id)
  const body = checkBody(options.limits, input.message)
  if (!body) throw new NegotiationError("message_required")
  const result = await s.addNote(id, { author_id: userId, body, now: ctx.now ?? new Date() })
  await notify(container, NegotiationEvents.MESSAGE_ADDED, result.thread, userActor(userId), result.message)
  return result
}

export async function teamCounter(
  ctx: Ctx,
  userId: string | null,
  id: string,
  input: {
    version: number
    price: PriceInput
    valid_until?: Date | null
    message?: string | null
    confirm_below_floor?: boolean
  }
) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const s = await requireEnabled(container)
  const options = await s.getOptions()
  await sweep(container, now)
  const thread = await teamThread(container, id)
  const { offer } = await previewOffer(container, thread, input.price)
  if (offer.total <= 0) throw new NegotiationError("price_required")
  await requireConfirmed(container, thread, offer, input.confirm_below_floor)
  let deadline = defaultOfferDeadline(now, options.expiryDays)
  if (input.valid_until) {
    const problem = checkOfferDeadline(input.valid_until, now)
    if (problem) throw new NegotiationError(problem === "past" ? "deadline_past" : "deadline_too_far")
    deadline = input.valid_until
  }
  const result = await s.applyMove(id, {
    move: "team_counter",
    version: input.version,
    now,
    actor: userActor(userId),
    patch: { offer, offer_total: offer.total, offer_expires_at: deadline },
    message: {
      author: "team",
      author_id: userId,
      type: "counter_offer",
      body: checkBody(options.limits, input.message),
      price: offer,
    },
  })
  await notify(container, NegotiationEvents.COUNTER_OFFERED, result.thread, userActor(userId), result.message)
  return result
}

/**
 * The team accepts: the customer's target price (`basis: "target"`), or its
 * own offer (`basis: "offer"`, e.g. when customers may not accept
 * themselves). `price` is what the person saw.
 */
export async function teamAccept(
  ctx: Ctx,
  userId: string | null,
  id: string,
  input: {
    version: number
    basis: "target" | "offer"
    price: number
    message?: string | null
    confirm_below_floor?: boolean
  }
) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const s = await requireEnabled(container)
  const options = await s.getOptions()
  await sweep(container, now)
  const thread = await teamThread(container, id)
  const accepted = input.basis === "target" ? thread.target : thread.offer
  if (!accepted) throw new NegotiationError("nothing_to_accept").withState(thread)
  if (accepted.total !== input.price) throw new NegotiationError("price_changed").withState(thread)
  await requireConfirmed(container, thread, accepted, input.confirm_below_floor)
  const result = await s.applyMove(id, {
    move: "team_accept",
    version: input.version,
    now,
    actor: userActor(userId),
    expectPrice: { column: input.basis === "target" ? "target_total" : "offer_total", value: input.price },
    patch: {
      accepted,
      accepted_total: accepted.total,
      accepted_by: "team",
      accepted_at: now,
      accepted_until: acceptedUntil(now, options.acceptedOfferDays),
      closed_at: now,
    },
    message: {
      author: "team",
      author_id: userId,
      type: "acceptance",
      body: checkBody(options.limits, input.message),
      price: accepted,
    },
  })
  await notify(container, NegotiationEvents.ACCEPTED, result.thread, userActor(userId), result.message)
  return result
}

export async function teamReject(
  ctx: Ctx,
  userId: string | null,
  id: string,
  input: { version: number; reason: string }
) {
  const { container } = ctx
  const now = ctx.now ?? new Date()
  const s = await requireEnabled(container)
  const options = await s.getOptions()
  await teamThread(container, id)
  const reason = checkBody(options.limits, input.reason)
  if (!reason) throw new NegotiationError("message_required")
  const result = await s.applyMove(id, {
    move: "team_reject",
    version: input.version,
    now,
    actor: userActor(userId),
    patch: { closed_at: now, offer: null, offer_total: null, offer_expires_at: null },
    message: { author: "team", author_id: userId, type: "rejection", body: reason },
  })
  await notify(container, NegotiationEvents.REJECTED, result.thread, userActor(userId), result.message)
  return result
}
