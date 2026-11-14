import type { EmailLocale } from "../locales"
import type { EmailData, OrderView } from "../types"

/** A made-up order for previews and test sends in stores that have no orders yet. */
export function sampleOrder(locale: EmailLocale): OrderView {
  const polish = locale === "pl"
  return {
    id: "order_sample",
    display_id: "1042",
    created_at: "2026-11-10T09:30:00.000Z",
    email: polish ? "anna.nowak@example.com" : "anna.smith@example.com",
    currency_code: polish ? "pln" : "eur",
    country_code: polish ? "pl" : "de",
    customer: { id: null, first_name: "Anna", last_name: polish ? "Nowak" : "Smith" },
    items: [
      {
        title: polish ? "Bluza z kapturem" : "Hooded sweatshirt",
        subtitle: polish ? "Rozmiar M / Grafitowy" : "Size M / Graphite",
        sku: "HOOD-M-GR",
        quantity: 1,
        unit_price: 189,
        total: 189,
      },
      {
        title: polish ? "Skarpety bawełniane" : "Cotton socks",
        subtitle: polish ? "3-pak" : "3-pack",
        sku: "SOCK-3",
        quantity: 2,
        unit_price: 29.5,
        total: 59,
      },
    ],
    subtotal: 248,
    shipping_total: 14.99,
    discount_total: 0,
    tax_total: 49.18,
    total: 262.99,
    shipping_address: polish
      ? ["Anna Nowak", "ul. Lipowa 12/4", "00-001 Warszawa", "Polska", "+48 600 100 200"]
      : ["Anna Smith", "Lindenstraße 12", "10115 Berlin", "Germany", "+49 30 1234567"],
    billing_address: polish
      ? ["Anna Nowak", "ul. Lipowa 12/4", "00-001 Warszawa", "Polska"]
      : ["Anna Smith", "Lindenstraße 12", "10115 Berlin", "Germany"],
    shipping_methods: [polish ? "Paczkomat InPost" : "Standard delivery"],
  }
}

/**
 * Example data for one email type, built around the given order (a real
 * one in the admin preview, or `sampleOrder`). Secrets are replaced by
 * obvious placeholders.
 */
export function sampleData(type: string, order: OrderView, urls: { action?: string | null }): EmailData {
  const lines = order.items.map((item) => ({ title: item.title, subtitle: item.subtitle, quantity: item.quantity }))
  const customer = {
    first_name: order.customer.first_name,
    last_name: order.customer.last_name,
    email: order.email,
  }
  const base: EmailData = { order, customer, action_url: urls.action ?? null }

  switch (type) {
    case "payment-received":
      return { ...base, payment: { amount: order.total, currency_code: order.currency_code } }
    case "order-fulfilled":
    case "order-shipped":
    case "order-delivered":
      return {
        ...base,
        shipment: { tracking: [{ number: "620999123456789012345678", url: base.action_url }], items: lines },
      }
    case "refund-issued":
      return { ...base, refund: { amount: order.items[0]?.total ?? order.total, currency_code: order.currency_code } }
    case "return-requested":
    case "return-accepted":
      return { ...base, return: { items: lines.slice(0, 1) } }
    case "welcome":
    case "password-reset":
      return { customer, action_url: base.action_url }
    case "email-verification":
      return {
        customer,
        action_url: base.action_url,
        code: "123456",
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }
    case "team-low-stock":
      return {
        action_url: base.action_url,
        low_stock: {
          threshold: 5,
          items: order.items.map((item, index) => ({
            title: item.title,
            sku: item.sku,
            location: "Main warehouse",
            available: index + 2,
          })),
        },
      }
    case "team-payment-failed":
      return {
        ...base,
        failure: {
          amount: order.total,
          currency_code: order.currency_code,
          reason: "Card declined (insufficient funds)",
          customer_email: order.email,
        },
      }
    default:
      return base
  }
}
