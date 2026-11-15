import type { MedusaContainer } from "@medusajs/framework/types"

import { Budget } from "../budget"
import { METHOD_GROUPS, type MethodGroup, methodGroup, methodLabel } from "../methods"
import { addAmount, rate, type Totals } from "../money"
import { isOrphan, type OrderRef } from "../orders"
import type { StripeReader } from "../reader"
import { intentsForOrder, ordersForIntents } from "./orders"
import { resolveStripe } from "./runtime"

type Row = Record<string, any>

/** Every view says whether it is complete: cut by the time budget (`missed`) or by the item limit (`truncated`). */
export type Completeness = { partial: boolean; missed: string[]; truncated: string[] }

const DAY = 86_400

export const OPEN_DISPUTE_STATUSES = new Set([
  "warning_needs_response",
  "needs_response",
  "under_review",
  "warning_under_review",
])

/** Types of balance transactions that are sales, refunds or fees (not payouts or transfers). */
const SALE_TYPES = new Set(["charge", "payment"])
const REFUND_TYPES = new Set(["refund", "payment_refund"])
const MOVEMENT_TYPES = new Set([
  "payout",
  "payout_cancel",
  "payout_failure",
  "transfer",
  "transfer_cancel",
  "topup",
  "topup_reversal",
])

export function dashboardUrl(live: boolean, kind: "payments" | "payouts" | "disputes", id: string): string {
  return `https://dashboard.stripe.com/${live ? "" : "test/"}${kind}/${id}`
}

function since(days: number, now: Date): number {
  return Math.floor(now.getTime() / 1000) - days * DAY
}

function completeness(budget: Budget, truncated: string[]): Completeness {
  return { partial: budget.partial || truncated.length > 0, missed: [...budget.missed], truncated }
}

function live(container: MedusaContainer): boolean {
  return resolveStripe(container).keyInfo()?.mode === "live"
}

/* Overview ----------------------------------------------------------------- */

export type MethodRow = { method: MethodGroup; attempts: number; succeeded: number; amounts: Totals }

export type Overview = Completeness & {
  days: number
  turnover: Totals
  fees: Totals
  net: Totals
  refunds: Totals
  success: { succeeded: number; attempts: number; per_mille: number | null }
  disputes: { open: number; amounts: Totals }
  balance: { available: Totals; pending: Totals } | null
  next_payout: { id: string; amount: number; currency: string; arrival_date: number; status: string } | null
  methods: MethodRow[]
}

/** Sums from balance transactions, per currency, in minor units. */
export function summarizeTransactions(transactions: Row[]) {
  const turnover: Totals = {}
  const fees: Totals = {}
  const net: Totals = {}
  const refunds: Totals = {}
  for (const t of transactions) {
    if (MOVEMENT_TYPES.has(t.type)) continue
    if (SALE_TYPES.has(t.type)) addAmount(turnover, t.currency, t.amount)
    if (REFUND_TYPES.has(t.type)) addAmount(refunds, t.currency, Math.abs(t.amount))
    if (t.type === "stripe_fee") addAmount(fees, t.currency, Math.abs(t.amount))
    else addAmount(fees, t.currency, t.fee ?? 0)
    addAmount(net, t.currency, t.net ?? 0)
  }
  return { turnover, fees, net, refunds }
}

/** Attempts and successes per payment method, from charges. */
export function summarizeCharges(charges: Row[]) {
  const rows = new Map<MethodGroup, MethodRow>(
    METHOD_GROUPS.map((method) => [method, { method, attempts: 0, succeeded: 0, amounts: {} }])
  )
  let succeeded = 0
  for (const charge of charges) {
    const row = rows.get(methodGroup(charge.payment_method_details))!
    row.attempts++
    if (charge.status === "succeeded") {
      row.succeeded++
      succeeded++
      addAmount(row.amounts, charge.currency, charge.amount)
    }
  }
  return {
    success: { succeeded, attempts: charges.length, per_mille: rate(succeeded, charges.length) },
    methods: [...rows.values()],
  }
}

export async function overview(
  container: MedusaContainer,
  reader: StripeReader,
  options: { days: number; fresh?: boolean; now?: Date; budgetMs?: number }
): Promise<Overview> {
  const now = options.now ?? new Date()
  const budget = new Budget(options.budgetMs)
  const created = { gte: since(options.days, now) }
  const fresh = options.fresh
  const truncated: string[] = []

  const [balance, transactions, charges, disputes, payouts] = await Promise.all([
    budget.run("balance", () => reader.get("/v1/balance", {}, { fresh }), null as Row | null),
    budget.run(
      "balance_transactions",
      () => reader.list<Row>("/v1/balance_transactions", { created }, { fresh, budget }),
      null
    ),
    budget.run("charges", () => reader.list<Row>("/v1/charges", { created }, { fresh, budget }), null),
    budget.run("disputes", () => reader.list<Row>("/v1/disputes", {}, { fresh, budget }), null),
    budget.run(
      "payouts",
      () => reader.list<Row>("/v1/payouts", { status: "pending" }, { fresh, budget, max: 100 }),
      null
    ),
  ])

  if (transactions?.truncated) truncated.push("balance_transactions")
  if (charges?.truncated) truncated.push("charges")
  if (disputes?.truncated) truncated.push("disputes")
  const sums = summarizeTransactions(transactions?.data ?? [])
  const byMethod = summarizeCharges(charges?.data ?? [])
  const open = (disputes?.data ?? []).filter((d) => OPEN_DISPUTE_STATUSES.has(d.status))
  const next = [...(payouts?.data ?? [])].sort((a, b) => a.arrival_date - b.arrival_date)[0]
  const perCurrency = (list: Row[] | undefined) => {
    const totals: Totals = {}
    for (const b of list ?? []) addAmount(totals, b.currency, b.amount)
    return totals
  }

  return {
    ...completeness(budget, truncated),
    days: options.days,
    ...sums,
    ...byMethod,
    disputes: { open: open.length, amounts: open.reduce((t, d) => addAmount(t, d.currency, d.amount), {} as Totals) },
    balance: balance ? { available: perCurrency(balance.available), pending: perCurrency(balance.pending) } : null,
    next_payout: next
      ? {
          id: next.id,
          amount: next.amount,
          currency: next.currency,
          arrival_date: next.arrival_date,
          status: next.status,
        }
      : null,
  }
}

/* Payments ----------------------------------------------------------------- */

export type PaymentRow = {
  id: string
  created: number
  status: string
  amount: number
  currency: string
  method: MethodGroup
  method_label: string
  decline: { code: string | null; message: string | null } | null
  risk_level: string | null
  risk_score: number | null
  three_d_secure: string | null
  fee: number | null
  net: number | null
  order: OrderRef | null
  orphan: boolean
  dashboard_url: string
}

export type PaymentFilters = { days: number; status?: string; method?: MethodGroup; currency?: string }

export function paymentRow(
  intent: Row,
  order: OrderRef | null,
  opts: { live: boolean; now: Date; graceMinutes: number }
): PaymentRow {
  const charge = typeof intent.latest_charge === "object" && intent.latest_charge ? intent.latest_charge : null
  const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null
  const details = charge?.payment_method_details ?? null
  const error = intent.last_payment_error
  const declined =
    error ?? (charge?.status === "failed" ? { code: charge.failure_code, message: charge.failure_message } : null)
  return {
    id: intent.id,
    created: intent.created,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    method: methodGroup(details, intent.payment_method_types ?? []),
    method_label: methodLabel(details, intent.payment_method_types ?? []),
    decline: declined
      ? {
          code: declined.decline_code ?? declined.code ?? charge?.outcome?.reason ?? null,
          message: declined.message ?? null,
        }
      : null,
    risk_level: charge?.outcome?.risk_level ?? null,
    risk_score: charge?.outcome?.risk_score ?? null,
    three_d_secure: details?.card?.three_d_secure?.result ?? null,
    fee: bt?.fee ?? null,
    net: bt?.net ?? null,
    order,
    orphan: isOrphan(intent as never, order, opts.now, opts.graceMinutes),
    dashboard_url: dashboardUrl(opts.live, "payments", intent.id),
  }
}

export async function payments(
  container: MedusaContainer,
  reader: StripeReader,
  filters: PaymentFilters & { fresh?: boolean; now?: Date; budgetMs?: number }
) {
  const now = filters.now ?? new Date()
  const budget = new Budget(filters.budgetMs)
  const list = await budget.run(
    "payment_intents",
    () =>
      reader.list<Row>(
        "/v1/payment_intents",
        { created: { gte: since(filters.days, now) }, expand: ["data.latest_charge.balance_transaction"] },
        { fresh: filters.fresh, budget }
      ),
    { data: [] as Row[], truncated: false }
  )
  const orders = await ordersForIntents(container, list.data as never)
  const { orphanGraceMinutes } = resolveStripe(container).getOptions()
  const isLive = live(container)
  const rows = list.data
    .map((intent) =>
      paymentRow(intent, orders.get(intent.id) ?? null, { live: isLive, now, graceMinutes: orphanGraceMinutes })
    )
    .filter(
      (r) =>
        (!filters.status || r.status === filters.status) &&
        (!filters.method || r.method === filters.method) &&
        (!filters.currency || r.currency === filters.currency.toLowerCase())
    )
  return { ...completeness(budget, list.truncated ? ["payment_intents"] : []), payments: rows }
}

/* Payouts ------------------------------------------------------------------ */

export async function payouts(
  container: MedusaContainer,
  reader: StripeReader,
  options: { days: number; fresh?: boolean; now?: Date }
) {
  const now = options.now ?? new Date()
  const budget = new Budget()
  const list = await budget.run(
    "payouts",
    () =>
      reader.list<Row>("/v1/payouts", { created: { gte: since(options.days, now) } }, { fresh: options.fresh, budget }),
    { data: [] as Row[], truncated: false }
  )
  const isLive = live(container)
  return {
    ...completeness(budget, list.truncated ? ["payouts"] : []),
    payouts: list.data.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      arrival_date: p.arrival_date,
      created: p.created,
      status: p.status,
      automatic: Boolean(p.automatic),
      dashboard_url: dashboardUrl(isLive, "payouts", p.id),
    })),
  }
}

/** The PaymentIntent behind a balance transaction's source (charge, refund, dispute, payment). */
export function intentOfSource(source: Row | string | null | undefined): string | null {
  if (!source || typeof source === "string") return null
  if (source.object === "payment_intent") return source.id
  const pi = source.payment_intent
  return typeof pi === "string" ? pi : (pi?.id ?? null)
}

/** Types whose money comes from a customer's payment, so they should have an order. */
const ORDER_TYPES = new Set(["charge", "payment", "refund", "payment_refund", "adjustment"])

export async function payoutDetail(
  container: MedusaContainer,
  reader: StripeReader,
  payoutId: string,
  options: { fresh?: boolean } = {}
) {
  const budget = new Budget()
  const payout = await reader.get<Row>(`/v1/payouts/${payoutId}`, {}, options)
  const list = await budget.run(
    "balance_transactions",
    () =>
      reader.list<Row>(
        "/v1/balance_transactions",
        { payout: payoutId, expand: ["data.source"] },
        { fresh: options.fresh, budget }
      ),
    { data: [] as Row[], truncated: false }
  )
  const items = list.data.filter((t) => t.type !== "payout")
  const intents = items
    .map((t) => ({
      id: intentOfSource(t.source),
      created: t.created,
      status: "succeeded",
      metadata: t.source?.metadata ?? null,
    }))
    .filter((i): i is { id: string; created: number; status: string; metadata: Row | null } => Boolean(i.id))
  const orders = await ordersForIntents(container, intents as never)
  const isLive = live(container)
  const rows = items.map((t) => {
    const intentId = intentOfSource(t.source)
    const order = intentId ? (orders.get(intentId) ?? null) : null
    return {
      id: t.id,
      type: t.type,
      created: t.created,
      amount: t.amount,
      fee: t.fee,
      net: t.net,
      currency: t.currency,
      description: t.description ?? null,
      payment_intent: intentId,
      order,
      missing_order: ORDER_TYPES.has(t.type) && !order,
      dashboard_url: intentId ? dashboardUrl(isLive, "payments", intentId) : null,
    }
  })
  return {
    ...completeness(budget, list.truncated ? ["balance_transactions"] : []),
    payout: {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      arrival_date: payout.arrival_date,
      status: payout.status,
      automatic: Boolean(payout.automatic),
      dashboard_url: dashboardUrl(isLive, "payouts", payout.id),
    },
    items: rows,
  }
}

/* Disputes ----------------------------------------------------------------- */

export const URGENT_DAYS = 3

export function disputeRow(d: Row, order: OrderRef | null, opts: { live: boolean; now: Date }) {
  const due = d.evidence_details?.due_by ?? null
  const daysLeft = due ? Math.ceil((due * 1000 - opts.now.getTime()) / 86_400_000) : null
  const intentId = typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null)
  return {
    id: d.id,
    amount: d.amount,
    currency: d.currency,
    reason: d.reason,
    status: d.status,
    created: d.created,
    due_by: due,
    days_left: daysLeft,
    urgent: daysLeft !== null && daysLeft < URGENT_DAYS,
    payment_intent: intentId,
    order,
    dashboard_url: dashboardUrl(opts.live, "disputes", d.id),
  }
}

export async function disputes(
  container: MedusaContainer,
  reader: StripeReader,
  options: { fresh?: boolean; now?: Date } = {}
) {
  const now = options.now ?? new Date()
  const budget = new Budget()
  const list = await budget.run(
    "disputes",
    () => reader.list<Row>("/v1/disputes", { expand: ["data.payment_intent"] }, { fresh: options.fresh, budget }),
    { data: [] as Row[], truncated: false }
  )
  const open = list.data.filter((d) => OPEN_DISPUTE_STATUSES.has(d.status))
  const intents = open
    .map((d) => (typeof d.payment_intent === "object" && d.payment_intent ? d.payment_intent : null))
    .filter(Boolean) as Row[]
  const orders = await ordersForIntents(container, intents as never)
  const isLive = live(container)
  const rows = open
    .map((d) =>
      disputeRow(
        d,
        orders.get(typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id) ?? null,
        { live: isLive, now }
      )
    )
    .sort((a, b) => (a.due_by ?? Infinity) - (b.due_by ?? Infinity))
  return { ...completeness(budget, list.truncated ? ["disputes"] : []), disputes: rows }
}

/* Order widget ------------------------------------------------------------- */

/** The payout that contains a balance transaction: the first payouts arriving after the money became available. */
async function payoutFor(reader: StripeReader, bt: Row, budget: Budget, fresh?: boolean) {
  if (!bt?.id || !bt.available_on) return null
  const candidates = await reader.list<Row>(
    "/v1/payouts",
    { arrival_date: { gte: bt.available_on } },
    { max: 100, fresh, budget }
  )
  const ordered = [...candidates.data]
    .filter((p) => p.automatic)
    .sort((a, b) => a.arrival_date - b.arrival_date)
    .slice(0, 3)
  for (const payout of ordered) {
    if (budget.expired) return null
    const items = await reader.list<Row>(
      "/v1/balance_transactions",
      { payout: payout.id },
      { max: 1000, fresh, budget }
    )
    if (items.data.some((t) => t.id === bt.id)) {
      return {
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        arrival_date: payout.arrival_date,
        status: payout.status,
      }
    }
  }
  return null
}

export async function orderPayments(
  container: MedusaContainer,
  reader: StripeReader,
  orderId: string,
  options: { fresh?: boolean } = {}
) {
  const budget = new Budget()
  const ids = await intentsForOrder(container, orderId)
  const isLive = live(container)
  const fresh = options.fresh
  const result: Row[] = []
  for (const id of ids) {
    const intent = await budget.run(
      `payment_intent:${id}`,
      () => reader.get<Row>(`/v1/payment_intents/${id}`, { expand: ["latest_charge.balance_transaction"] }, { fresh }),
      null as Row | null
    )
    if (!intent) continue
    const [refunds, intentDisputes] = await Promise.all([
      budget.run(
        `refunds:${id}`,
        () => reader.list<Row>("/v1/refunds", { payment_intent: id }, { fresh, budget, max: 100 }),
        null
      ),
      budget.run(
        `disputes:${id}`,
        () => reader.list<Row>("/v1/disputes", { payment_intent: id }, { fresh, budget, max: 100 }),
        null
      ),
    ])
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null
    const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null
    const payout = bt ? await budget.run(`payout:${id}`, () => payoutFor(reader, bt, budget, fresh), null) : null
    const row = paymentRow(
      intent,
      { id: orderId, display_id: null },
      { live: isLive, now: new Date(), graceMinutes: 0 }
    )
    result.push({
      ...row,
      amount_received: intent.amount_received ?? 0,
      capture_method: intent.capture_method,
      three_d_secure_version: charge?.payment_method_details?.card?.three_d_secure?.version ?? null,
      exchange_rate: bt?.exchange_rate ?? null,
      settlement: bt
        ? { amount: bt.amount, fee: bt.fee, net: bt.net, currency: bt.currency, available_on: bt.available_on }
        : null,
      refunds: (refunds?.data ?? []).map((r) => ({
        id: r.id,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        created: r.created,
      })),
      disputes: (intentDisputes?.data ?? []).map((d) => disputeRow(d, null, { live: isLive, now: new Date() })),
      payout: payout ? { ...payout, dashboard_url: dashboardUrl(isLive, "payouts", payout.id) } : null,
    })
  }
  return { ...completeness(budget, []), payments: result }
}
