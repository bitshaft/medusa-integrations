import { addDays } from "./format"
import { lowestPriceBeforeDiscount, type PricePoint } from "./omnibus"
import type { GpsrGap, RequestStatus, RequestType } from "./types"

/**
 * Sample data for demo mode. The admin shows it instead of the store's data
 * and refuses every change, so a demo never touches real records. Dates are
 * relative to `now` so the sample always looks current.
 */

const iso = (d: Date) => d.toISOString()

export function demoGpsrProducts(now = new Date()) {
  const checked = iso(addDays(now, -0.1))
  const rows: Array<{ product_id: string; title: string; status: string; gaps: GpsrGap[] }> = [
    { product_id: "demo_prod_kettle", title: "Czajnik elektryczny K-100", status: "published", gaps: [] },
    {
      product_id: "demo_prod_lamp",
      title: "Lampka biurkowa LED",
      status: "published",
      gaps: ["manufacturer.electronic_address", "identification.type"],
    },
    {
      product_id: "demo_prod_toy",
      title: "Klocki konstrukcyjne 500 el.",
      status: "published",
      gaps: ["responsible.name", "responsible.postal_address", "responsible.electronic_address"],
    },
    {
      product_id: "demo_prod_charger",
      title: "Ładowarka USB-C 65 W",
      status: "published",
      gaps: [
        "manufacturer.name",
        "manufacturer.postal_address",
        "manufacturer.electronic_address",
        "identification.type",
      ],
    },
    { product_id: "demo_prod_mug", title: "Kubek termiczny 450 ml", status: "draft", gaps: ["identification.batch"] },
  ]
  return rows.map((r) => ({ ...r, complete: r.gaps.length === 0, checked_at: checked }))
}

const REQUESTS: Array<{
  id: string
  type: RequestType
  status: RequestStatus
  email: string
  createdDaysAgo: number
  verifiedDaysAgo: number | null
}> = [
  {
    id: "demo_req_1",
    type: "access",
    status: "open",
    email: "anna.kowalska@example.com",
    createdDaysAgo: 26,
    verifiedDaysAgo: 25,
  },
  {
    id: "demo_req_2",
    type: "erasure",
    status: "accepted",
    email: "jan.nowak@example.com",
    createdDaysAgo: 12,
    verifiedDaysAgo: 12,
  },
  {
    id: "demo_req_3",
    type: "objection",
    status: "open",
    email: "ola@example.com",
    createdDaysAgo: 3,
    verifiedDaysAgo: 3,
  },
  {
    id: "demo_req_4",
    type: "portability",
    status: "unverified",
    email: "piotr@example.com",
    createdDaysAgo: 0.2,
    verifiedDaysAgo: null,
  },
  {
    id: "demo_req_5",
    type: "erasure",
    status: "completed",
    email: "anon-cusdemo5@invalid",
    createdDaysAgo: 40,
    verifiedDaysAgo: 40,
  },
  {
    id: "demo_req_6",
    type: "rectification",
    status: "rejected",
    email: "marek@example.com",
    createdDaysAgo: 20,
    verifiedDaysAgo: 19,
  },
]

export function demoRequests(now = new Date(), responseDays = 30) {
  return REQUESTS.map((r) => {
    const verified = r.verifiedDaysAgo === null ? null : addDays(now, -r.verifiedDaysAgo)
    const final = r.status === "completed" || r.status === "rejected"
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      email: r.email,
      customer_id: r.status === "unverified" ? null : `demo_cus_${r.id.slice(-1)}`,
      locale: "pl",
      details: r.type === "rectification" ? "Proszę poprawić nazwisko w adresie." : null,
      created_at: iso(addDays(now, -r.createdDaysAgo)),
      verified_at: verified ? iso(verified) : null,
      deadline_at: verified ? iso(addDays(verified, responseDays)) : null,
      closed_at: final ? iso(addDays(now, -r.createdDaysAgo + 5)) : null,
      reminded_at: null,
    }
  })
}

export function demoRequestEvents(id: string, now = new Date()) {
  const request = demoRequests(now).find((r) => r.id === id)
  if (!request) return []
  const events: Array<{ action: string; actor_type: string; note: string | null; created_at: string }> = [
    { action: "submitted", actor_type: "customer", note: null, created_at: request.created_at },
  ]
  if (request.verified_at)
    events.push({ action: "verified", actor_type: "customer", note: null, created_at: request.verified_at })
  if (request.status === "accepted" || request.status === "completed") {
    events.push({ action: "accepted", actor_type: "user", note: null, created_at: request.verified_at! })
  }
  if (request.status === "completed") {
    events.push({ action: "anonymized", actor_type: "user", note: null, created_at: request.closed_at! })
    events.push({ action: "completed", actor_type: "user", note: null, created_at: request.closed_at! })
  }
  if (request.status === "rejected") {
    events.push({
      action: "rejected",
      actor_type: "user",
      note: "Dane są poprawne; klient może je zmienić sam w koncie.",
      created_at: request.closed_at!,
    })
  }
  return events.map((e, i) => ({ id: `${id}_ev${i}`, request_id: id, actor_id: null, data: null, ...e }))
}

type DemoSeries = {
  variant_id: string
  product_id: string
  product_title: string
  variant_title: string
  sku: string
  /** [days ago, amount, regular, discounted] */
  points: Array<[number, number, number, boolean]>
  start_known: boolean
}

const SERIES: DemoSeries[] = [
  {
    variant_id: "demo_var_kettle",
    product_id: "demo_prod_kettle",
    product_title: "Czajnik elektryczny K-100",
    variant_title: "Stal",
    sku: "K100-ST",
    points: [
      [120, 199, 199, false],
      [45, 189, 189, false],
      [20, 209, 209, false],
      [5, 159, 209, true],
    ],
    start_known: false,
  },
  {
    variant_id: "demo_var_lamp",
    product_id: "demo_prod_lamp",
    product_title: "Lampka biurkowa LED",
    variant_title: "Czarna",
    sku: "LED-BK",
    points: [
      [12, 129, 129, false],
      [2, 99, 129, true],
    ],
    start_known: false,
  },
  {
    variant_id: "demo_var_mug",
    product_id: "demo_prod_mug",
    product_title: "Kubek termiczny 450 ml",
    variant_title: "Granat",
    sku: "MUG-450-NV",
    points: [
      [18, 59.99, 59.99, false],
      [8, 54.99, 59.99, true],
      [1, 49.99, 59.99, true],
    ],
    start_known: true,
  },
]

export function demoOmnibus(now = new Date(), periodDays = 30) {
  return SERIES.map((s) => {
    const points: PricePoint[] = s.points.map(([ago, amount, regular, discounted]) => ({
      at: addDays(now, -ago),
      amount,
      regular,
      discounted,
      kind: discounted ? "price_list" : null,
      ref: discounted ? "demo_plist" : null,
    }))
    const result = lowestPriceBeforeDiscount(points, {
      periodDays,
      start: { at: points[0].at, known: s.start_known },
    })
    return {
      variant_id: s.variant_id,
      product_id: s.product_id,
      product_title: s.product_title,
      variant_title: s.variant_title,
      sku: s.sku,
      region_id: "demo_reg_pl",
      region_name: "Polska",
      currency_code: "pln",
      ...result,
      points: points.map((p) => ({
        at: iso(p.at),
        amount: p.amount,
        regular: p.regular,
        discounted: p.discounted,
        kind: p.kind ?? null,
        source: "change",
      })),
    }
  })
}
