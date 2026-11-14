import { addMonths } from "./format"
import type { ComplianceSettings } from "./settings"

type Scope = ComplianceSettings["gdpr"]["anonymize"]

/** Placeholder e-mail: unique, so the person can sign up again with their real address. */
export function anonymousEmail(customerId: string): string {
  return `anon-${customerId.toLowerCase().replace(/[^a-z0-9]/g, "")}@invalid`
}

export const ADDRESS_PERSONAL_FIELDS = [
  "first_name",
  "last_name",
  "company",
  "address_1",
  "address_2",
  "city",
  "postal_code",
  "province",
  "phone",
] as const

/** An address with every personal field replaced; country stays for tax reports. */
export function anonymizedAddress(placeholder: string): Record<string, unknown> {
  const result: Record<string, unknown> = { metadata: null }
  for (const field of ADDRESS_PERSONAL_FIELDS) result[field] = field === "phone" ? null : placeholder
  return result
}

export function customerUpdate(customerId: string, scope: Scope) {
  return {
    email: anonymousEmail(customerId),
    first_name: scope.placeholder,
    last_name: scope.placeholder,
    phone: null,
    company_name: null,
    has_account: false,
    ...(scope.customer_metadata ? { metadata: { compliance_anonymized: true } } : {}),
  }
}

/** What happens to one order, given the settings and the order date. */
export function orderPlan(orderDate: Date, scope: Scope, now: Date) {
  const retentionEnds = scope.billing_retention_months > 0 ? addMonths(orderDate, scope.billing_retention_months) : null
  const billingNow = scope.order_billing_address || (retentionEnds !== null && retentionEnds <= now)
  return {
    email: scope.order_email,
    phone: scope.order_phone,
    shipping: scope.order_shipping_address,
    billing: billingNow,
    /** When the billing address must be removed later; null when removed now or kept for good. */
    billing_purge_after: billingNow ? null : retentionEnds,
  }
}

/** A short summary of the scope, saved in the request history. */
export function scopeSummary(scope: Scope): string[] {
  const kept: string[] = []
  if (!scope.order_email) kept.push("order_email")
  if (!scope.order_phone) kept.push("order_phone")
  if (!scope.order_shipping_address) kept.push("order_shipping_address")
  if (!scope.order_billing_address) kept.push(`order_billing_address:${scope.billing_retention_months}m`)
  if (!scope.carts) kept.push("carts")
  return kept
}
