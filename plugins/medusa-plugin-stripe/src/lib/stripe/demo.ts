import type { CheckResult } from "./checks"
import { addAmount, type Totals } from "./money"
import type { MethodGroup } from "./methods"
import { dashboardUrl, type PaymentRow, summarizeCharges } from "./server/views"

/**
 * Sample data for demo mode. The plugin builds no Stripe client in demo
 * mode, so these are the only data shown and nothing is ever sent to
 * Stripe. Dates are relative to `now` so the sample always looks current.
 */

const H = 3600
const D = 86_400
const complete = { partial: false, missed: [] as string[], truncated: [] as string[] }

type Sample = {
  id: string
  hoursAgo: number
  amount: number
  status: string
  method: MethodGroup
  label: string
  order: number | null
  decline?: { code: string; message: string }
  risk?: string
}

const SAMPLES: Sample[] = [
  { id: "pi_demo_01", hoursAgo: 2, amount: 25500, status: "succeeded", method: "blik", label: "BLIK", order: 1042 },
  {
    id: "pi_demo_02",
    hoursAgo: 5,
    amount: 18990,
    status: "succeeded",
    method: "card",
    label: "Visa •••• 4242",
    order: 1041,
  },
  {
    id: "pi_demo_03",
    hoursAgo: 7,
    amount: 9900,
    status: "requires_payment_method",
    method: "card",
    label: "Mastercard •••• 4444",
    order: null,
    decline: { code: "insufficient_funds", message: "Your card has insufficient funds." },
    risk: "normal",
  },
  {
    id: "pi_demo_04",
    hoursAgo: 26,
    amount: 43000,
    status: "succeeded",
    method: "apple_pay",
    label: "Apple Pay (Visa •••• 1881)",
    order: 1040,
  },
  {
    id: "pi_demo_05",
    hoursAgo: 30,
    amount: 12900,
    status: "succeeded",
    method: "p24",
    label: "Przelewy24 (mBank)",
    order: null,
  },
  {
    id: "pi_demo_06",
    hoursAgo: 50,
    amount: 7900,
    status: "succeeded",
    method: "google_pay",
    label: "Google Pay (Mastercard •••• 5100)",
    order: 1039,
  },
  {
    id: "pi_demo_07",
    hoursAgo: 75,
    amount: 31500,
    status: "requires_capture",
    method: "card",
    label: "Visa •••• 0077",
    order: 1038,
  },
  {
    id: "pi_demo_08",
    hoursAgo: 100,
    amount: 15000,
    status: "requires_payment_method",
    method: "card",
    label: "Visa •••• 0002",
    order: null,
    decline: { code: "card_declined", message: "Your card was declined." },
    risk: "elevated",
  },
  { id: "pi_demo_09", hoursAgo: 140, amount: 5900, status: "succeeded", method: "blik", label: "BLIK", order: 1037 },
]

const fee = (amount: number, method: MethodGroup) =>
  Math.round(amount * (method === "blik" || method === "p24" ? 0.019 : 0.015)) + 100

export function demoPayments(now = new Date()): PaymentRow[] {
  const ts = Math.floor(now.getTime() / 1000)
  return SAMPLES.map((s) => {
    const paid = s.status === "succeeded" || s.status === "requires_capture"
    const f = s.status === "succeeded" ? fee(s.amount, s.method) : null
    return {
      id: s.id,
      created: ts - s.hoursAgo * H,
      status: s.status,
      amount: s.amount,
      currency: "pln",
      method: s.method,
      method_label: s.label,
      decline: s.decline ?? null,
      risk_level: s.risk ?? (paid ? "normal" : null),
      risk_score: s.risk === "elevated" ? 67 : paid ? 12 : null,
      three_d_secure: s.method === "card" && paid ? "authenticated" : null,
      fee: f,
      net: f === null ? null : s.amount - f,
      order: s.order ? { id: `order_demo_${s.order}`, display_id: s.order } : null,
      orphan: paid && !s.order && s.hoursAgo > 0.5,
      dashboard_url: dashboardUrl(false, "payments", s.id),
    }
  })
}

export function demoOverview(days: number, now = new Date()) {
  const rows = demoPayments(now).filter((p) => p.created >= Math.floor(now.getTime() / 1000) - days * D)
  const turnover: Totals = {}
  const fees: Totals = {}
  const net: Totals = {}
  for (const r of rows) {
    if (r.status !== "succeeded") continue
    addAmount(turnover, r.currency, r.amount)
    addAmount(fees, r.currency, r.fee ?? 0)
    addAmount(net, r.currency, r.net ?? 0)
  }
  const charges = rows.map((r) => ({
    status: r.status === "succeeded" || r.status === "requires_capture" ? "succeeded" : "failed",
    amount: r.amount,
    currency: r.currency,
    payment_method_details:
      r.method === "apple_pay" || r.method === "google_pay"
        ? { type: "card", card: { wallet: { type: r.method } } }
        : { type: r.method === "p24" ? "p24" : r.method },
  }))
  const refunds = { pln: 4900 }
  addAmount(net, "pln", -4900)
  return {
    ...complete,
    days,
    turnover,
    fees,
    net,
    refunds,
    ...summarizeCharges(charges),
    disputes: { open: 2, amounts: { pln: 34000 } },
    balance: { available: { pln: 128450 }, pending: { pln: 61230, eur: 4500 } },
    next_payout: {
      id: "po_demo_3",
      amount: 128450,
      currency: "pln",
      arrival_date: Math.floor(now.getTime() / 1000) + 2 * D,
      status: "pending",
    },
  }
}

const PAYOUTS = [
  { id: "po_demo_3", daysAgo: -2, amount: 128450, status: "pending" },
  { id: "po_demo_2", daysAgo: 5, amount: 84210, status: "paid" },
  { id: "po_demo_1", daysAgo: 12, amount: 102990, status: "paid" },
]

export function demoPayouts(now = new Date()) {
  const ts = Math.floor(now.getTime() / 1000)
  return {
    ...complete,
    payouts: PAYOUTS.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: "pln",
      arrival_date: ts - p.daysAgo * D,
      created: ts - (p.daysAgo + 2) * D,
      status: p.status,
      automatic: true,
      dashboard_url: dashboardUrl(false, "payouts", p.id),
    })),
  }
}

export function demoPayoutDetail(id: string, now = new Date()) {
  const payout = demoPayouts(now).payouts.find((p) => p.id === id) ?? demoPayouts(now).payouts[1]
  const items = demoPayments(now)
    .filter((p) => p.status === "succeeded")
    .map((p, i) => ({
      id: `txn_demo_${i}`,
      type: "charge",
      created: p.created,
      amount: p.amount,
      fee: p.fee ?? 0,
      net: p.net ?? p.amount,
      currency: "pln",
      description: null as string | null,
      payment_intent: p.id,
      order: p.order,
      missing_order: !p.order,
      dashboard_url: p.dashboard_url,
    }))
  items.push({
    id: "txn_demo_refund",
    type: "refund",
    created: items[0]?.created ?? 0,
    amount: -4900,
    fee: 0,
    net: -4900,
    currency: "pln",
    description: "REFUND FOR CHARGE",
    payment_intent: "pi_demo_09",
    order: { id: "order_demo_1037", display_id: 1037 },
    missing_order: false,
    dashboard_url: dashboardUrl(false, "payments", "pi_demo_09"),
  })
  return { ...complete, payout, items }
}

export function demoDisputes(now = new Date()) {
  const ts = Math.floor(now.getTime() / 1000)
  const row = (id: string, amount: number, reason: string, dueDays: number, order: number) => ({
    id,
    amount,
    currency: "pln",
    reason,
    status: "needs_response",
    created: ts - 10 * D,
    due_by: ts + dueDays * D,
    days_left: Math.ceil(dueDays),
    urgent: Math.ceil(dueDays) < 3,
    payment_intent: `pi_demo_d${order}`,
    order: { id: `order_demo_${order}`, display_id: order },
    dashboard_url: dashboardUrl(false, "disputes", id),
  })
  return {
    ...complete,
    disputes: [
      row("dp_demo_1", 19000, "fraudulent", 1.5, 1012),
      row("dp_demo_2", 15000, "product_not_received", 9, 1020),
    ],
  }
}

export function demoChecks(): { partial: boolean; missed: string[]; checks: CheckResult[] } {
  return {
    partial: false,
    missed: [],
    checks: [
      {
        id: "provider",
        verdict: "ok",
        code: "registered",
        params: { id: "pp_stripe_stripe", extras: "pp_stripe-blik_stripe" },
      },
      { id: "api_key", verdict: "ok", code: "restricted", params: { last4: "D3m0", mode: "test" } },
      { id: "account", verdict: "ok", code: "active", params: { name: "Sklep Demo" } },
      { id: "payment_methods", verdict: "warn", code: "some_off", params: { off: "google_pay" } },
      {
        id: "webhook",
        verdict: "warn",
        code: "failed_deliveries",
        params: { url: "https://api.sklep-demo.pl/hooks/payment/stripe_stripe", count: 3 },
      },
      { id: "domains", verdict: "error", code: "missing", params: { domains: "sklep-demo.pl" } },
      { id: "capture", verdict: "ok", code: "matches", params: { expected: "automatic", total: 20 } },
      { id: "mode", verdict: "ok", code: "matches", params: { mode: "test", source: "option" } },
    ],
  }
}

export function demoOrderPayments(orderId: string, now = new Date()) {
  const ts = Math.floor(now.getTime() / 1000)
  const base = demoPayments(now)[1]
  return {
    ...complete,
    payments: [
      {
        ...base,
        order: { id: orderId, display_id: null },
        amount_received: base.amount,
        capture_method: "automatic",
        three_d_secure_version: "2.2.0",
        exchange_rate: null,
        settlement: { amount: base.amount, fee: base.fee, net: base.net, currency: "pln", available_on: ts + 2 * D },
        refunds: [
          {
            id: "re_demo_1",
            amount: 2000,
            currency: "pln",
            status: "succeeded",
            reason: "requested_by_customer",
            created: ts - H,
          },
        ],
        disputes: [],
        payout: {
          id: "po_demo_3",
          amount: 128450,
          currency: "pln",
          arrival_date: ts + 2 * D,
          status: "pending",
          dashboard_url: dashboardUrl(false, "payouts", "po_demo_3"),
        },
      },
    ],
  }
}
