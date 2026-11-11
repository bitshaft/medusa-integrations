import type { Brand, EmailData, EmailFormatters } from "./types"

/**
 * Values for `{{variables}}` in the copy, derived from the template data.
 * Simple top-level values of the data (strings and numbers) are available
 * under their own names too, which is what custom templates rely on.
 */
export function buildVariables(data: EmailData, brand: Brand, format: EmailFormatters): Record<string, string> {
  const variables: Record<string, string> = {}
  const set = (name: string, value: string | number | null | undefined) => {
    if (value !== undefined && value !== null && value !== "") {
      variables[name] = String(value)
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" || typeof value === "number") {
      set(key, value)
    }
  }

  set("store_name", brand.name)
  set("support_email", brand.supportEmail)

  const { order } = data
  const firstName = data.customer?.first_name ?? order?.customer.first_name
  const lastName = data.customer?.last_name ?? order?.customer.last_name
  const email = data.customer?.email ?? order?.email ?? data.failure?.customer_email
  const fullName = [firstName, lastName].filter(Boolean).join(" ")
  set("first_name", firstName)
  set("last_name", lastName)
  set("customer_email", email)
  set("customer_name", fullName || email)

  if (order) {
    set("order_number", order.display_id)
    set("order_total", format.money(order.total, order.currency_code))
    set("order_date", format.date(order.created_at))
  }
  if (data.payment) {
    set("amount", format.money(data.payment.amount, data.payment.currency_code))
  }
  if (data.refund) {
    set("refund_amount", format.money(data.refund.amount, data.refund.currency_code))
  }
  if (data.shipment?.tracking.length) {
    set("tracking_number", data.shipment.tracking.map((entry) => entry.number).join(", "))
  }
  if (data.code) {
    set("code", data.code)
  }
  if (data.expires_at) {
    set("expires_at", format.dateTime(data.expires_at))
  }
  if (data.low_stock) {
    set("count", data.low_stock.items.length)
    set("threshold", data.low_stock.threshold)
  }
  if (data.failure) {
    set("amount", format.money(data.failure.amount, data.failure.currency_code))
    set("reason", data.failure.reason)
  }
  return variables
}

/**
 * Variables that may be missing for a given email (a guest has no first
 * name, a payment failure may have no order). They render as nothing rather
 * than as a visible `{{placeholder}}`.
 */
export const OPTIONAL_VARIABLES = [
  "first_name",
  "last_name",
  "customer_name",
  "customer_email",
  "tracking_number",
  "order_number",
  "order_total",
  "order_date",
  "amount",
  "refund_amount",
  "reason",
  "code",
  "expires_at",
  "support_email",
]

export function withOptionalBlanks(variables: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of OPTIONAL_VARIABLES) {
    result[name] = ""
  }
  return { ...result, ...variables }
}
