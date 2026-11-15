import { createHash } from "node:crypto"

import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { addNegotiationsToCartWorkflow } from "../../../workflows/negotiations/add-negotiations-to-cart"
import { createNegotiationsDraftOrderWorkflow } from "../../../workflows/negotiations/create-negotiations-draft-order"
import { NegotiationError, type ReasonCode, REASONS } from "../messages"
import { lineTotal, toMajor, toMinor } from "../money"
import type { Actor, Offer } from "../types"
import { NegotiationEvents, type ThreadRecord } from "../views"
import { type CartRow, customerCart, isNegotiatedItem, loadCart, loadCustomer } from "./catalog"
import { graph, resolveNegotiations } from "./runtime"
import { customerThread, notify, requireCustomer, requireEnabled, teamThread } from "./threads"

type Row = Record<string, any>

/** A dry run is valid for this long; the write must use exactly the same data. */
export const DRY_RUN_TTL_MS = 30 * 60_000

/** Turns any error into a code the admin can show, keeping NegotiationError codes. */
function codeOf(error: unknown): ReasonCode | null {
  const e = error as { code?: string; message?: string }
  if (e?.code && e.code in REASONS) return e.code as ReasonCode
  const match = (Object.keys(REASONS) as ReasonCode[]).find((code) => e?.message === REASONS[code].en)
  return match ?? null
}

function rethrow(error: unknown): never {
  const code = codeOf(error)
  if (code && !(error instanceof NegotiationError)) throw new NegotiationError(code)
  throw error
}

/* Draft order --------------------------------------------------------------- */

export type DraftOrderChoices = {
  region_id?: string | null
  sales_channel_id?: string | null
  /** An address id of the customer, or `null` for none (e-mail only). Omitted: the default address. */
  address_id?: string | null
}

export type DraftOrderPlan = {
  thread_id: string
  number: string
  customer: { id: string; email: string | null; name: string }
  currency_code: string
  tax_inclusive: boolean
  region: { id: string; name: string; currency_code: string } | null
  region_reason: "chosen" | "address_country" | "first_with_currency" | null
  regions: Array<{ id: string; name: string; currency_code: string; countries: string[] }>
  address: Row | null
  addresses: Row[]
  sales_channel: { id: string; name: string } | null
  sales_channels: Array<{ id: string; name: string }>
  items: Array<{
    variant_id: string
    title: string
    sku: string | null
    quantity: number
    unit_price: number
    total: number
  }>
  total: number
  /** Why the write cannot be made now; empty when it can. */
  problems: ReasonCode[]
  /** A fingerprint of everything that would be written: the write must match the dry run's. */
  fingerprint: string
}

async function writerState(container: MedusaContainer, kind: "draftOrders" | "cart") {
  const s = resolveNegotiations(container)
  const [options, settings] = await Promise.all([s.getOptions(), s.getSettings()])
  return {
    on: options.writers[kind],
    armed: kind === "draftOrders" ? settings.armed.draft_orders : settings.armed.cart,
  }
}

/** What the draft order would be, with the defaults filled in and every problem listed. Writes nothing. */
export async function planDraftOrder(
  container: MedusaContainer,
  id: string,
  choices: DraftOrderChoices = {}
): Promise<DraftOrderPlan> {
  const thread = await teamThread(container, id)
  const s = resolveNegotiations(container)
  const query = graph(container)
  const problems: ReasonCode[] = []
  const writer = await writerState(container, "draftOrders")
  if (!writer.on) problems.push("writer_off")
  else if (!writer.armed) problems.push("writer_not_armed")
  if (thread.is_demo) problems.push("demo_thread")
  if (thread.status !== "accepted" || !thread.accepted) problems.push("not_accepted")
  if (thread.order_id) problems.push("draft_order_exists")
  const liveCart = (await s.listWrites(thread.id)).find((w) => w.kind === "cart" && w.status === "done")
  if (liveCart) problems.push("already_in_cart")

  const customer = thread.is_demo ? null : await loadCustomer(container, thread.customer_id)
  const { data: regionRows } = await query({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2"],
  })
  const regions = regionRows.map((r) => ({
    id: r.id,
    name: r.name,
    currency_code: r.currency_code,
    countries: (r.countries ?? []).filter(Boolean).map((c: Row) => String(c.iso_2).toLowerCase()),
  }))
  const sameCurrency = regions.filter((r) => r.currency_code === thread.currency_code)

  const addresses = customer?.addresses ?? []
  const address =
    choices.address_id === null
      ? null
      : choices.address_id
        ? (addresses.find((a) => a.id === choices.address_id) ?? null)
        : (addresses.find((a) => a.is_default_shipping) ?? addresses[0] ?? null)
  if (choices.address_id && !address)
    throw new NegotiationError("invalid_input", { details: "address_id is not an address of this customer" })

  let region: (typeof regions)[number] | null = null
  let regionReason: DraftOrderPlan["region_reason"] = null
  if (choices.region_id) {
    region = regions.find((r) => r.id === choices.region_id) ?? null
    if (!region) throw new NegotiationError("invalid_input", { details: `region ${choices.region_id} does not exist` })
    regionReason = "chosen"
    if (region.currency_code !== thread.currency_code) {
      throw new NegotiationError("currency_mismatch", { cart: region.currency_code, thread: thread.currency_code })
    }
  } else {
    const country = address?.country_code ? String(address.country_code).toLowerCase() : null
    region = (country && sameCurrency.find((r) => r.countries.includes(country))) || null
    if (region) regionReason = "address_country"
    else if (sameCurrency[0]) {
      region = sameCurrency[0]
      regionReason = "first_with_currency"
    }
  }
  if (!region) problems.push("no_region")

  const { data: channelRows } = await query({ entity: "sales_channel", fields: ["id", "name", "is_disabled"] })
  const channels = channelRows.filter((c) => !c.is_disabled).map((c) => ({ id: c.id, name: c.name }))
  let channel: DraftOrderPlan["sales_channel"] = null
  if (choices.sales_channel_id) {
    channel = channels.find((c) => c.id === choices.sales_channel_id) ?? null
    if (!channel)
      throw new NegotiationError("invalid_input", {
        details: `sales channel ${choices.sales_channel_id} does not exist`,
      })
  } else {
    const { data: store } = await query({ entity: "store", fields: ["default_sales_channel_id"] })
    channel = channels.find((c) => c.id === store[0]?.default_sales_channel_id) ?? channels[0] ?? null
  }

  const accepted: Offer = thread.accepted ?? thread.offer ?? thread.target
  const items = accepted.lines.map((l) => {
    const line = thread.lines.find((t) => t.variant_id === l.variant_id)
    return {
      variant_id: l.variant_id,
      title: line ? [line.product_title, line.variant_title].filter(Boolean).join(" · ") : l.variant_id,
      sku: line?.sku ?? null,
      quantity: l.quantity,
      unit_price: l.unit_price,
      total: lineTotal(l.unit_price, l.quantity),
    }
  })
  const name = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      customer.company_name ||
      customer.email ||
      customer.id
    : (thread.customer.email ?? thread.customer_id)
  const plan = {
    thread_id: thread.id,
    number: thread.number,
    customer: { id: thread.customer_id, email: customer?.email ?? thread.customer.email, name },
    currency_code: thread.currency_code,
    tax_inclusive: thread.tax_inclusive,
    region: region ? { id: region.id, name: region.name, currency_code: region.currency_code } : null,
    region_reason: regionReason,
    regions: sameCurrency,
    address,
    addresses,
    sales_channel: channel,
    sales_channels: channels,
    items,
    total: accepted.total,
    problems,
  }
  return { ...plan, fingerprint: fingerprint(plan) }
}

function fingerprint(plan: Omit<DraftOrderPlan, "fingerprint">): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        thread: plan.thread_id,
        region: plan.region?.id ?? null,
        channel: plan.sales_channel?.id ?? null,
        address: plan.address?.id ?? null,
        items: plan.items.map((i) => [i.variant_id, i.quantity, i.unit_price]),
        tax: plan.tax_inclusive,
      })
    )
    .digest("hex")
    .slice(0, 32)
}

export async function recordPlan(container: MedusaContainer, actor: Actor, id: string, choices: DraftOrderChoices) {
  const plan = await planDraftOrder(container, id, choices)
  const run = await resolveNegotiations(container).recordRun({
    thread_id: id,
    writer: "draft_order",
    stage: "plan",
    actor,
    input: choices,
    result: summary(plan),
  })
  return { plan, run_id: run.id }
}

const summary = (plan: DraftOrderPlan) => ({
  number: plan.number,
  region: plan.region?.name ?? null,
  sales_channel: plan.sales_channel?.name ?? null,
  address: plan.address
    ? [plan.address.address_1, plan.address.city, plan.address.country_code].filter(Boolean).join(", ")
    : null,
  items: plan.items.length,
  total: plan.total,
  currency_code: plan.currency_code,
  problems: plan.problems,
  fingerprint: plan.fingerprint,
})

/** Checks everything the write needs, without writing. The write must follow within 30 minutes with the same data. */
export async function dryRunDraftOrder(
  container: MedusaContainer,
  actor: Actor,
  id: string,
  choices: DraftOrderChoices
) {
  const s = resolveNegotiations(container)
  const plan = await planDraftOrder(container, id, choices)
  const problems = [...plan.problems]
  if (!plan.customer.email) problems.push("invalid_input")
  // Every variant must still exist; prices are the agreed ones, not the catalog's.
  const { data: variants } = await graph(container)({
    entity: "variant",
    fields: ["id"],
    filters: { id: plan.items.map((i) => i.variant_id) },
  })
  const missing = plan.items.filter((i) => !variants.some((v) => v.id === i.variant_id))
  if (missing.length) problems.push("variant_not_found")
  const ok = problems.length === 0
  const run = await s.recordRun({
    thread_id: id,
    writer: "draft_order",
    stage: ok ? "dry_run" : "error",
    actor,
    input: choices,
    result: { ...summary(plan), problems, ok },
    error: ok ? null : problems.join(", "),
  })
  return { plan: { ...plan, problems }, ok, run_id: run.id }
}

/** Creates the draft order: only after a successful dry run with the same data, only once per thread. */
export async function commitDraftOrder(container: MedusaContainer, actor: Actor, id: string, dryRunId: string) {
  const s = resolveNegotiations(container)
  const run = await s.getRun(dryRunId)
  if (!run || run.thread_id !== id || run.stage !== "dry_run" || !run.result?.ok) {
    throw new NegotiationError("dry_run_required")
  }
  if (Date.now() - new Date(run.created_at).getTime() > DRY_RUN_TTL_MS) throw new NegotiationError("dry_run_required")
  const choices = (run.input ?? {}) as DraftOrderChoices
  const plan = await planDraftOrder(container, id, choices)
  if (plan.fingerprint !== run.result.fingerprint) throw new NegotiationError("dry_run_required")
  if (plan.problems.length) throw new NegotiationError(plan.problems[0])
  const thread = await teamThread(container, id)

  const addressInput = plan.address
    ? {
        first_name: plan.address.first_name ?? undefined,
        last_name: plan.address.last_name ?? undefined,
        company: plan.address.company ?? undefined,
        address_1: plan.address.address_1 ?? undefined,
        address_2: plan.address.address_2 ?? undefined,
        city: plan.address.city ?? undefined,
        province: plan.address.province ?? undefined,
        postal_code: plan.address.postal_code ?? undefined,
        country_code: plan.address.country_code ?? undefined,
        phone: plan.address.phone ?? undefined,
      }
    : undefined
  const metadata = { negotiation_id: thread.id, negotiation_number: thread.number }
  try {
    const { result: order } = await createNegotiationsDraftOrderWorkflow(container).run({
      input: {
        thread_id: thread.id,
        actor_id: actor.id,
        order: {
          status: "draft",
          is_draft_order: true,
          region_id: plan.region!.id,
          customer_id: thread.customer_id,
          email: plan.customer.email ?? undefined,
          sales_channel_id: plan.sales_channel?.id,
          currency_code: thread.currency_code,
          shipping_address: addressInput,
          billing_address: addressInput,
          no_notification: true,
          metadata,
          items: plan.items.map((i) => ({
            variant_id: i.variant_id,
            title: i.title,
            quantity: i.quantity,
            unit_price: toMajor(i.unit_price, thread.currency_code),
            is_tax_inclusive: thread.tax_inclusive,
            metadata,
          })),
        } as never,
      },
    })
    const orderId = (order as { id: string }).id
    const now = new Date()
    const { thread: updated, message } = await s.addSystemMessage(id, {
      type: "draft_order_created",
      body: null,
      now,
      patch: { draft_order_id: orderId, order_id: orderId },
    })
    await s.recordRun({
      thread_id: id,
      writer: "draft_order",
      stage: "commit",
      actor,
      input: choices,
      result: { ...summary(plan), order_id: orderId },
    })
    await notify(container, NegotiationEvents.DRAFT_ORDER_CREATED, updated, actor, message, { draft_order_id: orderId })
    return { order_id: orderId, thread: updated }
  } catch (error) {
    await s.recordRun({
      thread_id: id,
      writer: "draft_order",
      stage: "error",
      actor,
      input: choices,
      error: (error as Error).message,
    })
    rethrow(error)
  }
}

/* Cart ---------------------------------------------------------------------- */

/** Line items of earlier cart writes that still exist; frees the writes whose lines were all removed. */
async function reconcileCartWrites(container: MedusaContainer, thread: ThreadRecord) {
  const s = resolveNegotiations(container)
  const live = (await s.listWrites(thread.id)).filter((w) => w.kind === "cart" && w.status === "done")
  if (!live.length) return
  const cartModule = container.resolve(Modules.CART) as unknown as {
    listLineItems: (filters: Row, config?: Row) => Promise<Row[]>
  }
  for (const write of live) {
    const ids = write.line_item_ids ?? []
    const existing = ids.length ? await cartModule.listLineItems({ id: ids }, { select: ["id"] }) : []
    if (existing.length) throw new NegotiationError("already_in_cart")
    await s.updateWrite(write.id, { status: "removed" })
  }
}

/**
 * Store API: puts the agreed lines into the customer's cart at the agreed
 * unit prices, tagged with the thread in their metadata. Once per offer at a
 * time: again only after the lines were removed, while the offer is valid
 * and before an order was placed from it.
 */
export async function addAgreedToCart(
  container: MedusaContainer,
  customerId: string | null,
  id: string,
  cartId: string
) {
  const s = await requireEnabled(container)
  const customer = await requireCustomer(container, customerId)
  const thread = await customerThread(container, customer.id, id)
  const writer = await writerState(container, "cart")
  if (!writer.on) throw new NegotiationError("writer_off")
  if (!writer.armed) throw new NegotiationError("writer_not_armed")
  if (thread.status !== "accepted" || !thread.accepted) throw new NegotiationError("not_accepted")
  if (thread.order_id) throw new NegotiationError("already_ordered")
  const now = new Date()
  if (!thread.accepted_until || thread.accepted_until.getTime() <= now.getTime()) {
    throw new NegotiationError("offer_expired", { date: thread.accepted_until?.toISOString().slice(0, 10) ?? "" })
  }
  const cart = await customerCart(container, cartId, customer.id)
  if (cart.currency_code !== thread.currency_code) {
    throw new NegotiationError("currency_mismatch", {
      cart: cart.currency_code.toUpperCase(),
      thread: thread.currency_code.toUpperCase(),
    })
  }
  if (cart.items.some((i) => i.metadata?.negotiation_id === thread.id)) throw new NegotiationError("already_in_cart")
  await reconcileCartWrites(container, thread)

  const actor: Actor = { type: "customer", id: customer.id }
  const metadata = { negotiation_id: thread.id, negotiation_number: thread.number }
  let writeId: string | null = null
  try {
    const { result: write } = await addNegotiationsToCartWorkflow(container).run({
      input: {
        thread_id: thread.id,
        actor_id: customer.id,
        cart_id: cart.id,
        items: thread.accepted.lines.map((l) => ({
          variant_id: l.variant_id,
          quantity: l.quantity,
          unit_price: toMajor(l.unit_price, thread.currency_code),
          is_tax_inclusive: thread.tax_inclusive,
          metadata,
        })),
      },
    })
    writeId = write.id
    const after = await loadCart(container, cart.id)
    const lineIds = (after?.items ?? [])
      .filter((i) => i.metadata?.negotiation_id === thread.id)
      .map((i) => i.id as string)
    await s.updateWrite(write.id, { status: "done", target_id: cart.id, line_item_ids: lineIds })
    const { thread: updated, message } = await s.addSystemMessage(id, { type: "added_to_cart", body: null, now })
    await s.recordRun({
      thread_id: id,
      writer: "cart",
      stage: "commit",
      actor,
      input: { cart_id: cart.id },
      result: {
        cart_id: cart.id,
        line_item_ids: lineIds,
        total: thread.accepted.total,
        currency_code: thread.currency_code,
      },
    })
    await notify(container, NegotiationEvents.ADDED_TO_CART, updated, actor, message, { cart_id: cart.id })
    return { cart_id: cart.id, line_item_ids: lineIds, thread: updated }
  } catch (error) {
    if (writeId) await s.updateWrite(writeId, { status: "failed", error: (error as Error).message })
    const code = codeOf(error)
    if (!code || !["already_in_cart", "write_in_progress", "already_ordered"].includes(code)) {
      await s.recordRun({
        thread_id: id,
        writer: "cart",
        stage: "error",
        actor,
        input: { cart_id: cart.id },
        error: (error as Error).message,
      })
    }
    rethrow(error)
  }
}

/* Cart guards (Store API middlewares) --------------------------------------- */

const RESERVED = /^negotiation_/

/** Customers cannot set the plugin's metadata keys on their own lines. */
export function refuseReservedMetadata(metadata: unknown): void {
  if (metadata && typeof metadata === "object" && Object.keys(metadata).some((k) => RESERVED.test(k))) {
    throw new NegotiationError("reserved_metadata")
  }
}

/** A negotiated line keeps its quantity; removing it is fine. */
export async function guardLineItemUpdate(container: MedusaContainer, cartId: string, lineId: string, body: Row) {
  refuseReservedMetadata(body?.metadata)
  const cart = await loadCart(container, cartId)
  const item = cart?.items.find((i) => i.id === lineId)
  if (!item || !isNegotiatedItem(item)) return
  if (body?.quantity !== undefined && Number(body.quantity) !== Number(item.quantity) && Number(body.quantity) !== 0) {
    throw new NegotiationError("negotiated_line_locked")
  }
}

/**
 * Before checkout: every negotiated line in the cart must belong to an
 * accepted, still valid offer of this customer, written into this cart by
 * the plugin, with exactly the agreed variants, quantities and prices.
 */
export async function validateCartNegotiations(container: MedusaContainer, cart: CartRow): Promise<void> {
  const tagged = cart.items.filter(isNegotiatedItem)
  if (!tagged.length) return
  const s = resolveNegotiations(container)
  const byThread = new Map<string, Row[]>()
  for (const item of tagged) {
    const key = String(item.metadata.negotiation_id)
    byThread.set(key, [...(byThread.get(key) ?? []), item])
  }
  const writes = await s.liveCartWrites([...byThread.keys()])
  const now = Date.now()
  for (const [threadId, items] of byThread) {
    const thread = await s.getThread(threadId)
    const fail = (reason: string) => {
      throw new NegotiationError("negotiated_line_invalid", { number: thread?.number ?? threadId, reason })
    }
    if (!thread || !thread.accepted || thread.status !== "accepted") fail("no agreed offer")
    if (thread!.customer_id !== cart.customer_id) fail("another customer's offer")
    if (thread!.order_id) fail("already ordered")
    if (!thread!.accepted_until || thread!.accepted_until.getTime() <= now) fail("the offer has expired")
    if (thread!.currency_code !== cart.currency_code) fail("another currency")
    const write = writes.find((w) => w.thread_id === threadId && w.target_id === cart.id)
    const ids = new Set(write?.line_item_ids ?? [])
    if (!write || items.some((i) => !ids.has(i.id))) fail("lines not added by the store")
    const agreed = thread!.accepted!.lines
    if (items.length !== agreed.length) fail("lines are missing")
    for (const line of agreed) {
      const item = items.find((i) => i.variant_id === line.variant_id)
      if (!item) fail("lines are missing")
      if (Number(item!.quantity) !== line.quantity) fail("another quantity")
      if (toMinor(item!.unit_price, cart.currency_code) !== line.unit_price) fail("another price")
    }
  }
}

/** After an order is placed: its negotiated lines close their threads' cart writes. */
export async function recordOrderPlaced(container: MedusaContainer, orderId: string) {
  const s = resolveNegotiations(container)
  if (!(await s.isEnabled())) return
  const { data } = await graph(container)({
    entity: "order",
    fields: ["id", "items.id", "items.metadata"],
    filters: { id: orderId },
  })
  const threadIds = new Set<string>(
    (data[0]?.items ?? [])
      .filter((i: Row) => i?.metadata?.negotiation_id)
      .map((i: Row) => String(i.metadata.negotiation_id))
  )
  for (const threadId of threadIds) {
    const thread = await s.getThread(threadId)
    if (!thread || thread.order_id) continue
    for (const write of await s.listWrites(threadId)) {
      if (write.kind === "cart" && write.status === "done") await s.updateWrite(write.id, { status: "ordered" })
    }
    await s.setOrder(threadId, orderId)
  }
}
