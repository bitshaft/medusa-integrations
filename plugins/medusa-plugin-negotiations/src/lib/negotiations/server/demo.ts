import type { MedusaContainer } from "@medusajs/framework/types"

import { acceptedUntil } from "../expiry"
import { catalogTotal, toMajor, toMinor } from "../money"
import { buildOffer, buildTarget } from "../offers"
import type { CustomerSnapshot, Offer, Status, ThreadKind, ThreadLine } from "../types"
import type NegotiationsModuleService from "../../../modules/negotiations/service"
import type { NewMessage } from "../../../modules/negotiations/service"
import { priceBases, storeCurrency } from "./catalog"
import { graph, resolveNegotiations } from "./runtime"

/**
 * Demo threads: a set that shows everything the plugin does (every status,
 * product and cart threads, every offer mode, several rounds, a lapsed
 * counter-offer, an offer added to the cart, internal notes, assignees and
 * a thread long overdue for a reply), spread over the last 30 days so the
 * overview has something to count.
 *
 * Lines use the store's own published products and prices when it has
 * any, so thumbnails, product pages and amounts look real; otherwise
 * built-in sample products. Demo threads never expire, never write to
 * Medusa (no draft orders, no carts) and never send anything.
 */

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
  kowalski: {
    id: "cus_demo_kowalski",
    email: "jan.kowalski@example.com",
    first_name: "Jan",
    last_name: "Kowalski",
    company_name: null,
  },
}

/** Built-in products (prices in grosze), used when the store has no published products with prices. */
const SAMPLE_LINES: ThreadLine[] = [
  sample("drill", "Wiertarka udarowa PRO 850", "850 W", "WU-850", 42_900),
  sample("cable", "Przewód YDY 3x2,5", "100 m", "YDY-325-100", 38_900),
  sample("socket", "Gniazdo podwójne", "białe", "GN-2-W", 2_450),
  sample("box", "Puszka podtynkowa", "60 mm", "PP-60", 189),
  sample("pot", "Donica ceramiczna", "40 cm, antracyt", "DC-40-A", 8_900),
  sample("ladder", "Drabina aluminiowa", "3x9", "DA-3x9", 69_900),
  sample("lamp", "Oprawa LED 60x60", "40 W", "LED-6060", 13_900),
  sample("soil", "Ziemia uniwersalna", "50 l", "ZU-50", 2_490),
  sample("paint", "Farba lateksowa", "10 l, biała", "FL-10-W", 15_900),
  sample("tape", "Taśma malarska", "48 mm", "TM-48", 1_290),
]

function sample(id: string, product: string, variant: string, sku: string, price: number): ThreadLine {
  return {
    variant_id: `variant_demo_${id}`,
    product_id: `prod_demo_${id}`,
    product_title: product,
    variant_title: variant,
    sku,
    thumbnail: null,
    quantity: 1,
    catalog_unit_price: price,
  }
}

type Step = {
  after_h: number
  author: "customer" | "team" | "system"
  type: NewMessage["type"]
  body?: string
  price?: Offer
}

type Money = (amount: number) => string

type Built = {
  lines: ThreadLine[]
  target: Offer
  steps: Step[]
  /** The offer on the table (countered). */
  offer?: Offer
  offer_valid_h?: number
  accepted?: { price: Offer; by: "customer" | "team" }
}

type DemoSpec = {
  customer: keyof typeof customers
  kind: ThreadKind
  /** Which products (indexes into the catalog, wrapping) and how many of each. */
  items: Array<[index: number, quantity: number]>
  started_h_ago: number
  status: Status
  /** Assigned to the admin who restored the demo. */
  assigned?: boolean
  build: (lines: ThreadLine[], money: Money) => Built
}

/** The catalog price times `ratio`, at least one minor unit. */
const unitAt = (line: ThreadLine, ratio: number) => Math.max(1, Math.round(line.catalog_unit_price * ratio))
const totalAt = (lines: ThreadLine[], ratio: number) => Math.max(1, Math.round(catalogTotal(lines) * ratio))
const unit = (lines: ThreadLine[], ratio: number) =>
  buildOffer(lines, { mode: "unit", unit_price: unitAt(lines[0], ratio) })
const total = (lines: ThreadLine[], ratio: number) => buildOffer(lines, { mode: "total", total: totalAt(lines, ratio) })
const perLine = (lines: ThreadLine[], ratios: number[]) =>
  buildOffer(lines, {
    mode: "lines",
    lines: lines.map((line, i) => ({ variant_id: line.variant_id, unit_price: unitAt(line, ratios[i] ?? ratios[0]) })),
  })

const SPECS: DemoSpec[] = [
  {
    // Fresh request, the team's move, with an internal note and an assignee.
    customer: "budmax",
    kind: "product",
    items: [[0, 40]],
    started_h_ago: 3,
    status: "open",
    assigned: true,
    build: (lines, money) => {
      const target = buildTarget("product", lines, unitAt(lines[0], 0.84))
      return {
        lines,
        target,
        steps: [
          {
            after_h: 0,
            author: "customer",
            type: "target_price",
            body: `Dzień dobry, potrzebujemy ${lines[0].quantity} sztuk na nową budowę. Czy możliwa jest cena ${money(target.lines[0].unit_price)} za sztukę?`,
            price: target,
          },
          {
            after_h: 1,
            author: "team",
            type: "internal_note",
            body: "Stały klient, w tym kwartale trzy zamówienia. Sprawdzić stan magazynu przed odpowiedzią.",
          },
        ],
      }
    },
  },
  {
    // A cart waiting for a reply for days: the oldest one on the list.
    customer: "kowalski",
    kind: "cart",
    items: [
      [8, 12],
      [9, 30],
    ],
    started_h_ago: 4 * 24,
    status: "open",
    build: (lines, money) => {
      const target = buildTarget("cart", lines, totalAt(lines, 0.8))
      return {
        lines,
        target,
        steps: [
          {
            after_h: 0,
            author: "customer",
            type: "target_price",
            body: `Remontuję mieszkanie i biorę wszystko za jednym razem. Czy zrobią Państwo ${money(target.total)} za całość?`,
            price: target,
          },
          { after_h: 26, author: "customer", type: "message", body: "Czy mogę prosić o odpowiedź do końca tygodnia?" },
        ],
      }
    },
  },
  {
    // A cart priced line by line, the offer expires tomorrow.
    customer: "techpol",
    kind: "cart",
    items: [
      [1, 30],
      [2, 200],
      [3, 500],
    ],
    started_h_ago: 50,
    status: "countered",
    build: (lines, money) => {
      const target = buildTarget("cart", lines, totalAt(lines, 0.78))
      const offer = perLine(lines, [0.88, 0.85, 0.8])
      return {
        lines,
        target,
        offer,
        offer_valid_h: 20,
        steps: [
          {
            after_h: 0,
            author: "customer",
            type: "target_price",
            body: `Wycena całego koszyka pod przetarg. Budżet ${money(target.total)}.`,
            price: target,
          },
          { after_h: 3, author: "team", type: "message", body: "Dziękujemy, sprawdzamy dostępność u dostawcy." },
          {
            after_h: 20,
            author: "team",
            type: "counter_offer",
            body: `Wyceniliśmy każdą pozycję osobno, razem ${money(offer.total)}. Oferta ważna do jutra.`,
            price: offer,
          },
        ],
      }
    },
  },
  {
    // Several rounds: target, counter, a new target, a second counter.
    customer: "greenline",
    kind: "product",
    items: [[4, 120]],
    started_h_ago: 6 * 24,
    status: "countered",
    assigned: true,
    build: (lines, money) => {
      const target = unit(lines, 0.7)
      const first = unit(lines, 0.9)
      const second = unit(lines, 0.8)
      const offer = unit(lines, 0.85)
      return {
        lines,
        target: second,
        offer,
        offer_valid_h: 5 * 24,
        steps: [
          {
            after_h: 0,
            author: "customer",
            type: "target_price",
            body: "Zamówienie sezonowe do sieci sklepów.",
            price: target,
          },
          { after_h: 2, author: "team", type: "counter_offer", price: first },
          {
            after_h: 24,
            author: "customer",
            type: "target_price",
            body: `Konkurencja daje ${money(second.lines[0].unit_price)}. Spotkamy się w połowie?`,
            price: second,
          },
          {
            after_h: 30,
            author: "team",
            type: "internal_note",
            body: "Marża przy tej cenie nadal powyżej minimum. Zgoda kierownika jest.",
          },
          {
            after_h: 31,
            author: "team",
            type: "counter_offer",
            body: `Ostatnie słowo: ${money(offer.lines[0].unit_price)} za sztukę przy odbiorze całości.`,
            price: offer,
          },
        ],
      }
    },
  },
  {
    // The counter-offer lapsed: back with the team.
    customer: "techpol",
    kind: "product",
    items: [[6, 300]],
    started_h_ago: 9 * 24,
    status: "open",
    build: (lines) => {
      const target = unit(lines, 0.75)
      return {
        lines,
        target,
        steps: [
          { after_h: 0, author: "customer", type: "target_price", price: target },
          { after_h: 5, author: "team", type: "counter_offer", price: unit(lines, 0.88) },
          { after_h: 5 + 48, author: "system", type: "offer_expired" },
          {
            after_h: 5 + 50,
            author: "customer",
            type: "message",
            body: "Przepraszam, przegapiłem termin. Czy oferta jest nadal aktualna?",
          },
        ],
      }
    },
  },
  {
    // Accepted by the customer and added to the cart.
    customer: "budmax",
    kind: "cart",
    items: [
      [5, 10],
      [0, 5],
    ],
    started_h_ago: 4 * 24,
    status: "accepted",
    build: (lines) => {
      const target = total(lines, 0.8)
      const offer = total(lines, 0.86)
      return {
        lines,
        target,
        accepted: { price: offer, by: "customer" },
        steps: [
          { after_h: 0, author: "customer", type: "target_price", price: target },
          { after_h: 2, author: "team", type: "counter_offer", body: "Darmowa dostawa w cenie.", price: offer },
          { after_h: 6, author: "customer", type: "acceptance", price: offer },
          { after_h: 6.2, author: "system", type: "added_to_cart" },
        ],
      }
    },
  },
  {
    // The team accepted the customer's price straight away.
    customer: "greenline",
    kind: "product",
    items: [[7, 400]],
    started_h_ago: 12 * 24,
    status: "accepted",
    build: (lines) => {
      const target = unit(lines, 0.9)
      return {
        lines,
        target,
        accepted: { price: target, by: "team" },
        steps: [
          { after_h: 0, author: "customer", type: "target_price", body: "Jak co roku, cała paleta.", price: target },
          { after_h: 1, author: "team", type: "acceptance", body: "Zgoda, dziękujemy za zamówienie!", price: target },
        ],
      }
    },
  },
  {
    customer: "budmax",
    kind: "product",
    items: [[5, 10]],
    started_h_ago: 15 * 24,
    status: "rejected",
    build: (lines, money) => {
      const target = unit(lines, 0.6)
      return {
        lines,
        target,
        steps: [
          { after_h: 0, author: "customer", type: "target_price", price: target },
          {
            after_h: 4,
            author: "team",
            type: "rejection",
            body: `Ta cena jest poniżej naszego kosztu zakupu. Najniższa możliwa to ${money(unitAt(lines[0], 0.87))}.`,
          },
        ],
      }
    },
  },
  {
    customer: "techpol",
    kind: "product",
    items: [[6, 150]],
    started_h_ago: 27 * 24,
    status: "expired",
    build: (lines) => {
      const target = unit(lines, 0.8)
      return {
        lines,
        target,
        steps: [
          { after_h: 0, author: "customer", type: "target_price", price: target },
          {
            after_h: 6,
            author: "team",
            type: "message",
            body: "Czy termin dostawy za trzy tygodnie jest akceptowalny?",
          },
          { after_h: 14 * 24 + 6, author: "system", type: "expiry" },
        ],
      }
    },
  },
  {
    customer: "kowalski",
    kind: "product",
    items: [[7, 40]],
    started_h_ago: 20 * 24,
    status: "withdrawn",
    build: (lines) => {
      const target = unit(lines, 0.75)
      return {
        lines,
        target,
        steps: [
          { after_h: 0, author: "customer", type: "target_price", price: target },
          { after_h: 30, author: "customer", type: "withdrawal", body: "Kupiłem gdzie indziej, dziękuję." },
        ],
      }
    },
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

export type DemoOptions = {
  now?: Date
  /** The admin user who restored the demo: some threads are assigned to them. */
  assigneeId?: string | null
}

/** Replaces the demo threads with a fresh set. Real threads are not touched. */
export async function resetDemo(container: MedusaContainer, options: DemoOptions = {}) {
  const s = resolveNegotiations(container)
  await s.clearDemo()
  await seed(s, await demoCatalog(container), options)
}

/** Seeds the demo threads once, the first time the admin opens the page in demo mode. */
export async function ensureDemo(container: MedusaContainer, options: DemoOptions = {}) {
  const s = resolveNegotiations(container)
  if (!(await s.getOptions()).demo || (await s.hasDemo())) return
  await seed(s, await demoCatalog(container), options)
}

type DemoCatalog = { currency: string; taxInclusive: boolean; lines: ThreadLine[] }

/**
 * One variant of each published product that has a price in the store's
 * currency, in catalog order. Falls back to the built-in products in PLN.
 */
async function demoCatalog(container: MedusaContainer): Promise<DemoCatalog> {
  const fallback: DemoCatalog = { currency: "pln", taxInclusive: false, lines: SAMPLE_LINES }
  try {
    const options = await resolveNegotiations(container).getOptions()
    const currency = (options.defaultCurrency ?? (await storeCurrency(container)) ?? "pln").toLowerCase()
    const taxInclusive = (await priceBases(container)).currencies[currency] ?? false
    const { data } = await graph(container)({
      entity: "variant",
      fields: [
        "id",
        "title",
        "sku",
        "product.id",
        "product.title",
        "product.thumbnail",
        "product.status",
        "prices.amount",
        "prices.currency_code",
      ],
      pagination: { take: 200 },
    })
    const lines: ThreadLine[] = []
    const products = new Set<string>()
    for (const variant of data as Array<Record<string, any>>) {
      const product = variant?.product
      if (!product || product.status !== "published" || products.has(product.id)) continue
      const price = (variant.prices ?? []).find(
        (p: Record<string, unknown> | null) => p && String(p.currency_code).toLowerCase() === currency
      )
      const amount = price ? toMinor(price.amount, currency) : null
      if (!amount || amount <= 0) continue
      // One variant per product, so the demo spreads over the catalog.
      products.add(product.id)
      lines.push({
        variant_id: variant.id,
        product_id: product.id,
        product_title: product.title ?? variant.title ?? variant.id,
        variant_title: variant.title ?? null,
        sku: variant.sku ?? null,
        thumbnail: product.thumbnail ?? null,
        quantity: 1,
        catalog_unit_price: amount,
      })
    }
    return lines.length ? { currency, taxInclusive, lines } : { ...fallback, taxInclusive }
  } catch {
    return fallback
  }
}

async function seed(s: NegotiationsModuleService, catalog: DemoCatalog, input: DemoOptions) {
  const options = await s.getOptions()
  const now = input.now ?? new Date()
  const money: Money = (amount) => `${toMajor(amount, catalog.currency)} ${catalog.currency.toUpperCase()}`
  let n = 0
  for (const spec of SPECS) {
    n += 1
    const customer = customers[spec.customer]
    const picked = pickLines(catalog.lines, spec.items)
    const built = spec.build(picked, money)
    const { lines, target, steps } = built
    const started = new Date(now.getTime() - spec.started_h_ago * HOUR)
    const at = (step: Step) => new Date(started.getTime() + step.after_h * HOUR)
    const moves = steps.filter((step) => step.type !== "internal_note" && step.author !== "system")
    const last = moves[moves.length - 1]
    const lastStep = steps[steps.length - 1]
    const firstTeam = steps.find((step) => step.author === "team" && step.type !== "internal_note")
    const offer = spec.status === "countered" ? (built.offer ?? null) : null
    const accepted = spec.status === "accepted" ? (built.accepted ?? null) : null
    const acceptance = steps.find((step) => step.type === "acceptance")
    const closed = ["accepted", "rejected", "expired", "withdrawn"].includes(spec.status)
    const closedAt = closed ? at(acceptance ?? lastStep) : null
    const number = `NEG-DEMO-${String(n).padStart(4, "0")}`
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
        lines,
        currency_code: catalog.currency,
        tax_inclusive: catalog.taxInclusive,
        region_id: null,
        source_cart_id: null,
        product_id: lines[0].product_id,
        variant_id: spec.kind === "product" ? lines[0].variant_id : null,
        quantity_total: lines.reduce((sum, l) => sum + l.quantity, 0),
        catalog_total: catalogTotal(lines),
        target,
        target_total: target.total,
        offer,
        offer_total: offer?.total ?? null,
        offer_expires_at: offer ? new Date(now.getTime() + (built.offer_valid_h ?? 7 * 24) * HOUR) : null,
        accepted: accepted?.price ?? null,
        accepted_total: accepted?.price.total ?? null,
        accepted_by: accepted?.by ?? null,
        accepted_at: accepted && closedAt ? closedAt : null,
        accepted_until: accepted && closedAt ? acceptedUntil(closedAt, options.acceptedOfferDays) : null,
        status: spec.status,
        turn: STATUS_TURN[spec.status],
        assignee_id: spec.assigned ? (input.assigneeId ?? null) : null,
        last_activity_at: last ? at(last) : started,
        last_author: last?.author ?? "customer",
        first_team_reply_at: firstTeam ? at(firstTeam) : null,
        closed_at: closedAt,
        draft_order_id: null,
        order_id: null,
        search_text: [
          number,
          customer.email,
          customer.company_name,
          customer.first_name,
          customer.last_name,
          ...lines.flatMap((l) => [l.product_title, l.sku]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        created_at: started,
      },
      steps.map((step) => ({
        author: step.author,
        author_id:
          step.author === "customer" ? customer.id : step.author === "team" ? (input.assigneeId ?? null) : null,
        type: step.type,
        body: step.body ?? null,
        price: step.price ?? null,
        internal: step.type === "internal_note",
        created_at: at(step),
      }))
    )
  }
}

/** The spec's products from the catalog (wrapping when it is short), each variant once per thread. */
function pickLines(catalog: ThreadLine[], items: DemoSpec["items"]): ThreadLine[] {
  const seen = new Set<string>()
  const lines: ThreadLine[] = []
  for (const [index, quantity] of items) {
    for (let offset = 0; offset < catalog.length; offset++) {
      const line = catalog[(index + offset) % catalog.length]
      if (seen.has(line.variant_id)) continue
      seen.add(line.variant_id)
      lines.push({ ...line, quantity })
      break
    }
  }
  return lines
}

export const DEMO_THREAD_COUNT = SPECS.length
