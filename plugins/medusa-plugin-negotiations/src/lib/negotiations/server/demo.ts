import type { MedusaContainer } from "@medusajs/framework/types"

import { acceptedUntil, DAY_MS } from "../expiry"
import { catalogTotal } from "../money"
import { buildOffer, buildTarget } from "../offers"
import type { CustomerSnapshot, Offer, Status, ThreadKind, ThreadLine } from "../types"
import type NegotiationsModuleService from "../../../modules/negotiations/service"
import type { NewMessage } from "../../../modules/negotiations/service"
import { priceBases } from "./catalog"
import { resolveNegotiations } from "./runtime"

const HOUR = 3_600_000

const customers: Record<string, CustomerSnapshot & { id: string }> = {
  budmax: {
    id: "cus_demo_budmax",
    email: "zakupy@budmax.example",
    first_name: "Anna",
    last_name: "Nowak",
    company_name: "Budmax Sp. z o.o.",
  },
  techpol: {
    id: "cus_demo_techpol",
    email: "biuro@techpol.example",
    first_name: "Piotr",
    last_name: "Zieliński",
    company_name: "Techpol S.A.",
  },
  greenline: {
    id: "cus_demo_greenline",
    email: "orders@greenline.example",
    first_name: "Marta",
    last_name: "Kowalczyk",
    company_name: "Greenline",
  },
}

const line = (
  id: string,
  product: string,
  variant: string,
  sku: string,
  quantity: number,
  price: number
): ThreadLine => ({
  variant_id: `variant_demo_${id}`,
  product_id: `prod_demo_${id}`,
  product_title: product,
  variant_title: variant,
  sku,
  thumbnail: null,
  quantity,
  catalog_unit_price: price,
})

type Step = {
  after_h: number
  author: "customer" | "team" | "system"
  type: NewMessage["type"]
  body?: string
  price?: Offer
}

type DemoSpec = {
  n: number
  customer: keyof typeof customers
  kind: ThreadKind
  lines: ThreadLine[]
  target: number
  started_h_ago: number
  status: Status
  steps: (lines: ThreadLine[], target: Offer) => Step[]
  offer?: (lines: ThreadLine[]) => Offer
  offer_valid_days?: number
}

const unitOffer = (lines: ThreadLine[], unit: number) => buildOffer(lines, { mode: "unit", unit_price: unit })

const SPECS: DemoSpec[] = [
  {
    n: 1,
    customer: "budmax",
    kind: "product",
    lines: [line("drill", "Wiertarka udarowa PRO 850", "850 W", "WU-850", 40, 42_900)],
    target: 36_000,
    started_h_ago: 5,
    status: "open",
    steps: (_, target) => [
      {
        after_h: 0,
        author: "customer",
        type: "target_price",
        body: "Dzień dobry, potrzebujemy 40 sztuk na nową budowę. Czy możliwa jest cena 360 zł netto?",
        price: target,
      },
      {
        after_h: 1,
        author: "team",
        type: "internal_note",
        body: "Stały klient, ostatnio 3 zamówienia. Sprawdzić stan magazynu.",
      },
    ],
  },
  {
    n: 2,
    customer: "techpol",
    kind: "cart",
    lines: [
      line("cable", "Przewód YDY 3x2,5", "100 m", "YDY-325-100", 30, 38_900),
      line("socket", "Gniazdo podwójne", "białe", "GN-2-W", 200, 2_450),
      line("box", "Puszka podtynkowa", "60 mm", "PP-60", 500, 189),
    ],
    target: 1_500_000,
    started_h_ago: 50,
    status: "countered",
    offer: (lines) => buildOffer(lines, { mode: "total", total: 1_620_000 }),
    offer_valid_days: 1,
    steps: (lines, target) => [
      {
        after_h: 0,
        author: "customer",
        type: "target_price",
        body: "Wycena całego koszyka pod przetarg. Budżet 15 000 zł netto.",
        price: target,
      },
      { after_h: 3, author: "team", type: "message", body: "Dziękujemy, sprawdzamy dostępność przewodów." },
      {
        after_h: 20,
        author: "team",
        type: "counter_offer",
        body: "Możemy zejść do 16 200 zł za całość.",
        price: buildOffer(lines, { mode: "total", total: 1_620_000 }),
      },
    ],
  },
  {
    n: 3,
    customer: "greenline",
    kind: "product",
    lines: [line("pot", "Donica ceramiczna", "40 cm, antracyt", "DC-40-A", 120, 8_900)],
    target: 6_900,
    started_h_ago: 26 * 24,
    status: "accepted",
    steps: (lines, target) => [
      { after_h: 0, author: "customer", type: "target_price", body: "Zamówienie sezonowe, 120 sztuk.", price: target },
      { after_h: 2, author: "team", type: "counter_offer", price: unitOffer(lines, 7_400) },
      { after_h: 5, author: "customer", type: "acceptance", price: unitOffer(lines, 7_400) },
    ],
  },
  {
    n: 4,
    customer: "budmax",
    kind: "product",
    lines: [line("ladder", "Drabina aluminiowa", "3x9", "DA-3x9", 10, 69_900)],
    target: 45_000,
    started_h_ago: 8 * 24,
    status: "rejected",
    steps: (_, target) => [
      { after_h: 0, author: "customer", type: "target_price", price: target },
      {
        after_h: 4,
        author: "team",
        type: "rejection",
        body: "Cena poniżej naszego kosztu zakupu. Najniższa możliwa to 610 zł.",
      },
    ],
  },
  {
    n: 5,
    customer: "techpol",
    kind: "product",
    lines: [line("lamp", "Oprawa LED 60x60", "40 W", "LED-6060", 300, 13_900)],
    target: 11_000,
    started_h_ago: 20 * 24,
    status: "expired",
    steps: (_, target) => [
      { after_h: 0, author: "customer", type: "target_price", price: target },
      { after_h: 6, author: "team", type: "message", body: "Czy termin dostawy w marcu jest akceptowalny?" },
      { after_h: 14 * 24 + 6, author: "system", type: "expiry" },
    ],
  },
  {
    n: 6,
    customer: "greenline",
    kind: "product",
    lines: [line("soil", "Ziemia uniwersalna", "50 l", "ZU-50", 400, 2_490)],
    target: 1_900,
    started_h_ago: 3 * 24,
    status: "withdrawn",
    steps: (_, target) => [
      { after_h: 0, author: "customer", type: "target_price", price: target },
      { after_h: 30, author: "customer", type: "withdrawal", body: "Klient końcowy zrezygnował." },
    ],
  },
]

const STATUS_TURN: Record<Status, "team" | "customer" | null> = {
  open: "team",
  countered: "customer",
  accepted: null,
  rejected: null,
  expired: null,
  withdrawn: null,
}

/** Replaces the demo threads with a fresh set in every state. Demo threads never expire and never write. */
export async function resetDemo(container: MedusaContainer, now = new Date()) {
  const s = resolveNegotiations(container)
  await s.clearDemo()
  await seed(s, now, await demoTaxInclusive(container))
}

/** Seeds the demo threads once, the first time the admin opens the page in demo mode. */
export async function ensureDemo(container: MedusaContainer) {
  const s = resolveNegotiations(container)
  if (!(await s.getOptions()).demo || (await s.hasDemo())) return
  await seed(s, new Date(), await demoTaxInclusive(container))
}

/** Demo threads are in PLN, net or gross as the store prices PLN; net when that can't be read. */
async function demoTaxInclusive(container: MedusaContainer): Promise<boolean> {
  try {
    return (await priceBases(container)).currencies.pln ?? false
  } catch {
    return false
  }
}

async function seed(s: NegotiationsModuleService, now: Date, taxInclusive: boolean) {
  const options = await s.getOptions()
  for (const spec of SPECS) {
    const customer = customers[spec.customer]
    const started = new Date(now.getTime() - spec.started_h_ago * HOUR)
    const target = buildTarget(spec.kind, spec.lines, spec.target)
    const steps = spec.steps(spec.lines, target)
    const at = (step: Step) => new Date(started.getTime() + step.after_h * HOUR)
    const moves = steps.filter((s) => s.type !== "internal_note" && s.author !== "system")
    const last = moves[moves.length - 1]
    const firstTeam = steps.find((s) => s.author === "team" && s.type !== "internal_note")
    const accepted = spec.status === "accepted" ? (steps.find((s) => s.type === "acceptance")?.price ?? null) : null
    const offer = spec.status === "countered" && spec.offer ? spec.offer(spec.lines) : null
    const closedStep = ["accepted", "rejected", "expired", "withdrawn"].includes(spec.status)
      ? steps[steps.length - 1]
      : null
    const number = `NEG-DEMO-${String(spec.n).padStart(4, "0")}`
    await s.insertThread(
      {
        number,
        is_demo: true,
        customer_id: customer.id,
        customer: {
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          company_name: customer.company_name,
        },
        kind: spec.kind,
        lines: spec.lines,
        currency_code: "pln",
        tax_inclusive: taxInclusive,
        region_id: null,
        source_cart_id: null,
        product_id: spec.lines[0].product_id,
        variant_id: spec.kind === "product" ? spec.lines[0].variant_id : null,
        quantity_total: spec.lines.reduce((sum, l) => sum + l.quantity, 0),
        catalog_total: catalogTotal(spec.lines),
        target,
        target_total: target.total,
        offer,
        offer_total: offer?.total ?? null,
        offer_expires_at: offer ? new Date(now.getTime() + (spec.offer_valid_days ?? 7) * DAY_MS) : null,
        accepted,
        accepted_total: accepted?.total ?? null,
        accepted_by: accepted ? "customer" : null,
        accepted_at: accepted && closedStep ? at(closedStep) : null,
        accepted_until: accepted && closedStep ? acceptedUntil(at(closedStep), options.acceptedOfferDays) : null,
        status: spec.status,
        turn: STATUS_TURN[spec.status],
        assignee_id: null,
        last_activity_at: last ? at(last) : started,
        last_author: last?.author ?? "customer",
        first_team_reply_at: firstTeam ? at(firstTeam) : null,
        closed_at: closedStep ? at(closedStep) : null,
        draft_order_id: null,
        order_id: null,
        search_text: [
          number,
          customer.email,
          customer.company_name,
          customer.first_name,
          customer.last_name,
          ...spec.lines.flatMap((l) => [l.product_title, l.sku]),
        ]
          .join(" ")
          .toLowerCase(),
        created_at: started,
      },
      steps.map((step) => ({
        author: step.author,
        author_id: step.author === "customer" ? customer.id : null,
        type: step.type,
        body: step.body ?? null,
        price: step.price ?? null,
        internal: step.type === "internal_note",
        created_at: at(step),
      }))
    )
  }
}

export const DEMO_THREAD_COUNT = SPECS.length
