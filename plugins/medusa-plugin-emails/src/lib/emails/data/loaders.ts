import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { toNumber } from "../format"
import type { EmailData, EmailLoader, EmailLoaderContext, LoadedEmail, QuantityLine } from "../types"
import { fetchOrder, itemTitleIndex, type RawOrder, toOrderView } from "./order"

/**
 * Loaders turn the small input a trigger provides (IDs from an event) into
 * the data a template renders, plus who the email goes to and in which
 * language. They load fresh data on every call, so a retry or a resend shows
 * the current state of the order.
 */

const skip = (reason: string): LoadedEmail => ({ data: {}, skip: reason })

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)

/** Everything order emails share: the view, the recipient, the language and the order link. */
async function loadOrder(
  orderId: string | null,
  context: EmailLoaderContext,
  audience: "customer" | "team" = "customer"
) {
  const raw = orderId ? await fetchOrder(context.container, orderId) : null
  if (!raw) {
    return null
  }
  const locale =
    audience === "team"
      ? context.defaultLocale
      : context.locale(
          [raw.locale, raw.metadata?.locale, raw.customer?.metadata?.locale],
          raw.shipping_address?.country_code
        )
  const order = toOrderView(raw, locale)
  const orderUrl = context.url("order", {
    order_id: order.id,
    display_id: order.display_id,
    country_code: order.country_code,
    email: order.email,
    locale,
  })
  const loaded: LoadedEmail & { data: EmailData } = {
    to: order.email,
    locale,
    order_id: order.id,
    customer_id: order.customer.id,
    resource_type: "order",
    resource_id: order.id,
    data: {
      order,
      customer: { first_name: order.customer.first_name, last_name: order.customer.last_name, email: order.email },
      action_url:
        audience === "team" ? (context.url("adminOrder", { order_id: order.id }) ?? null) : (orderUrl ?? null),
    },
  }
  return { raw, order, loaded }
}

const orderEmail =
  (audience: "customer" | "team" = "customer"): EmailLoader =>
  async (input, context) => {
    const result = await loadOrder(str(input.order_id), context, audience)
    return result ? result.loaded : skip(`order ${String(input.order_id)} was not found`)
  }

/** `payment.captured`: the payment and the order it belongs to. */
const paymentReceived: EmailLoader = async (input, context) => {
  const payment = await fetchPayment(context, str(input.payment_id))
  if (!payment) {
    return skip(`payment ${String(input.payment_id)} was not found`)
  }
  const result = await loadOrder(payment.order_id, context)
  if (!result) {
    return skip(`payment ${payment.id} is not linked to an order`)
  }
  return {
    ...result.loaded,
    data: {
      ...result.loaded.data,
      payment: { amount: payment.captured_amount || payment.amount, currency_code: payment.currency_code },
    },
  }
}

/** `payment.refunded`: the newest refund of the payment. One email per refund. */
const refundIssued: EmailLoader = async (input, context) => {
  const payment = await fetchPayment(context, str(input.payment_id))
  if (!payment) {
    return skip(`payment ${String(input.payment_id)} was not found`)
  }
  const refund = [...payment.refunds].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!refund) {
    return skip(`payment ${payment.id} has no refunds`)
  }
  const result = await loadOrder(payment.order_id, context)
  if (!result) {
    return skip(`payment ${payment.id} is not linked to an order`)
  }
  return {
    ...result.loaded,
    dedupe_key: `refund-issued:${refund.id}`,
    data: {
      ...result.loaded.data,
      refund: { amount: refund.amount, currency_code: payment.currency_code, note: refund.note },
    },
  }
}

/** `shipment.created` and `delivery.created`: the fulfillment, its tracking numbers and its order. */
const shipment: EmailLoader = async (input, context) => {
  if (input.no_notification === true) {
    return skip("the fulfillment was created with notifications turned off")
  }
  const query = context.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "fulfillment",
    filters: { id: str(input.fulfillment_id) ?? "" },
    fields: [
      "id",
      "labels.tracking_number",
      "labels.tracking_url",
      "items.title",
      "items.quantity",
      "items.line_item_id",
      "order.id",
    ],
  })
  const fulfillment = data[0] as unknown as
    | {
        id: string
        labels?: Array<{ tracking_number?: string | null; tracking_url?: string | null } | null> | null
        items?: Array<{ title?: string | null; quantity?: unknown; line_item_id?: string | null } | null> | null
        order?: { id?: string | null } | null
      }
    | undefined
  if (!fulfillment) {
    return skip(`fulfillment ${String(input.fulfillment_id)} was not found`)
  }
  const result = await loadOrder(fulfillment.order?.id ?? null, context)
  if (!result) {
    return skip(`fulfillment ${fulfillment.id} is not linked to an order`)
  }

  const titles = itemTitleIndex(result.raw)
  const tracking = (fulfillment.labels ?? [])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.tracking_number))
    .map((entry) => ({ number: String(entry.tracking_number), url: safeUrl(entry.tracking_url) }))
  const items: QuantityLine[] = (fulfillment.items ?? [])
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      ...(titles.get(item.line_item_id ?? "") ?? { title: item.title ?? "" }),
      quantity: toNumber(item.quantity),
    }))

  return {
    ...result.loaded,
    resource_type: "fulfillment",
    resource_id: fulfillment.id,
    data: {
      ...result.loaded.data,
      // The carrier's tracking page when there is one, else the order page.
      action_url: tracking.find((entry) => entry.url)?.url ?? result.loaded.data.action_url,
      shipment: { tracking, items },
    },
  }
}

/** `order.return_requested` and `order.return_received`: the return's items. */
const orderReturn =
  (quantityField: "quantity" | "received_quantity"): EmailLoader =>
  async (input, context) => {
    const result = await loadOrder(str(input.order_id), context)
    if (!result) {
      return skip(`order ${String(input.order_id)} was not found`)
    }
    const query = context.container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "return",
      filters: { id: str(input.return_id) ?? "" },
      fields: ["id", "no_notification", "items.item_id", "items.quantity", "items.received_quantity"],
    })
    const found = data[0] as unknown as
      | {
          id: string
          no_notification?: boolean | null
          items?: Array<{ item_id?: string | null; quantity?: unknown; received_quantity?: unknown } | null> | null
        }
      | undefined
    if (!found) {
      return skip(`return ${String(input.return_id)} was not found`)
    }
    if (found.no_notification) {
      return skip("the return was created with notifications turned off")
    }
    const titles = itemTitleIndex(result.raw)
    const items: QuantityLine[] = (found.items ?? [])
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...(titles.get(item.item_id ?? "") ?? { title: "" }),
        quantity: toNumber(item[quantityField]) || toNumber(item.quantity),
      }))
      .filter((item) => item.title && item.quantity > 0)

    return {
      ...result.loaded,
      resource_type: "return",
      resource_id: found.id,
      data: { ...result.loaded.data, return: { items } },
    }
  }

/** `customer.created`: only for customers who registered, not for guests created at checkout. */
const welcome: EmailLoader = async (input, context) => {
  const customer = await fetchCustomer(context, { id: str(input.customer_id) ?? "" })
  if (!customer) {
    return skip(`customer ${String(input.customer_id)} was not found`)
  }
  if (!customer.has_account) {
    return skip("the customer is a guest without an account")
  }
  const locale = context.locale([customer.metadata?.locale])
  return {
    to: customer.email,
    locale,
    customer_id: customer.id,
    resource_type: "customer",
    resource_id: customer.id,
    data: {
      customer: { first_name: customer.first_name, last_name: customer.last_name, email: customer.email },
      action_url: context.url("store", { locale }) ?? null,
    },
  }
}

/** `auth.password_reset`: `entity_id` is the email address; `actor_type` is `customer` or `user`. */
const passwordReset: EmailLoader = async (input, context) => {
  const email = str(input.entity_id)
  const token = str(input.token)
  if (!email || !email.includes("@") || !token) {
    return skip("the password reset event has no email address or token")
  }
  const isAdminUser = input.actor_type === "user"
  const customer = isAdminUser ? null : await fetchCustomer(context, { email, has_account: true })
  const locale = isAdminUser ? context.defaultLocale : context.locale([customer?.metadata?.locale])
  const url = context.url(isAdminUser ? "adminPasswordReset" : "passwordReset", { token, email, locale })
  if (!url) {
    return skip(
      isAdminUser
        ? 'the reset link cannot be built: set the "adminUrl" option'
        : 'the reset link cannot be built: set the "storefrontUrl" option (or "urls.passwordReset")'
    )
  }
  return {
    to: email,
    locale,
    customer_id: customer?.id ?? null,
    resource_type: isAdminUser ? "user" : "customer",
    resource_id: customer?.id ?? null,
    data: {
      customer: { first_name: customer?.first_name ?? null, last_name: customer?.last_name ?? null, email },
      action_url: url,
    },
  }
}

/** `auth.verification_requested`: a code Medusa generated for an email address. */
const emailVerification: EmailLoader = async (input, context) => {
  const email = str(input.entity_id)
  const code = str(input.code)
  if (!email || !email.includes("@")) {
    return skip("the verification is not for an email address")
  }
  if (!code) {
    return skip("the verification event has no code")
  }
  const customer = await fetchCustomer(context, { email, has_account: true })
  const locale = context.locale([
    (input.metadata as Record<string, unknown> | undefined)?.locale,
    customer?.metadata?.locale,
  ])
  return {
    to: email,
    locale,
    customer_id: customer?.id ?? null,
    resource_type: "customer",
    resource_id: customer?.id ?? null,
    data: {
      customer: { first_name: customer?.first_name ?? null, last_name: customer?.last_name ?? null, email },
      code,
      expires_at: input.expires_at ? new Date(input.expires_at as string).toISOString() : null,
      action_url: context.url("emailVerification", { code, email, locale }) ?? null,
    },
  }
}

/** Low stock job: the items are already in the input. */
const teamLowStock: EmailLoader = async (input, context) => {
  const items = Array.isArray(input.items) ? (input.items as NonNullable<EmailData["low_stock"]>["items"]) : []
  if (!items.length) {
    return skip("no items are low on stock")
  }
  return {
    locale: context.defaultLocale,
    resource_type: "inventory",
    data: {
      low_stock: { threshold: toNumber(input.threshold), items },
      action_url: context.url("adminInventory") ?? null,
    },
  }
}

/** `emails.payment.failed`: whatever the payment integration knows about the failure. */
const teamPaymentFailed: EmailLoader = async (input, context) => {
  const result = await loadOrder(str(input.order_id), context, "team")
  const failure = {
    amount:
      input.amount === undefined || input.amount === null ? (result?.order.total ?? null) : toNumber(input.amount),
    currency_code: str(input.currency_code) ?? result?.order.currency_code ?? null,
    reason: str(input.reason),
    customer_email: str(input.customer_email) ?? result?.order.email ?? null,
    provider: str(input.provider_id),
  }
  return {
    ...(result?.loaded ?? { resource_type: "payment", resource_id: str(input.payment_id) }),
    to: null,
    locale: context.defaultLocale,
    data: { ...(result?.loaded.data ?? { action_url: null }), failure },
  }
}

export const BUILT_IN_LOADERS: Record<string, EmailLoader> = {
  "order-confirmation": orderEmail(),
  "payment-received": paymentReceived,
  "order-shipped": shipment,
  "order-delivered": shipment,
  "order-canceled": orderEmail(),
  "refund-issued": refundIssued,
  "return-requested": orderReturn("quantity"),
  "return-accepted": orderReturn("received_quantity"),
  welcome,
  "email-verification": emailVerification,
  "password-reset": passwordReset,
  "team-new-order": orderEmail("team"),
  "team-low-stock": teamLowStock,
  "team-payment-failed": teamPaymentFailed,
}

/* Helpers ----------------------------------------------------------------- */

type CustomerRecord = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  has_account: boolean
  metadata: Record<string, unknown> | null
}

async function fetchCustomer(context: EmailLoaderContext, filters: Record<string, unknown>) {
  const query = context.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "customer",
    filters,
    fields: ["id", "email", "first_name", "last_name", "has_account", "metadata"],
  })
  return (data[0] as unknown as CustomerRecord) ?? null
}

async function fetchPayment(context: EmailLoaderContext, paymentId: string | null) {
  if (!paymentId) {
    return null
  }
  const query = context.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "payment",
    filters: { id: paymentId },
    fields: [
      "id",
      "amount",
      "currency_code",
      "captures.amount",
      "refunds.id",
      "refunds.amount",
      "refunds.note",
      "refunds.created_at",
      "payment_collection.order.id",
    ],
  })
  const payment = data[0] as unknown as
    | {
        id: string
        amount?: unknown
        currency_code: string
        captures?: Array<{ amount?: unknown } | null> | null
        refunds?: Array<{
          id: string
          amount?: unknown
          note?: string | null
          created_at?: string | Date
        } | null> | null
        payment_collection?: { order?: { id?: string | null } | null } | null
      }
    | undefined
  if (!payment) {
    return null
  }
  return {
    id: payment.id,
    amount: toNumber(payment.amount),
    captured_amount: (payment.captures ?? []).reduce((sum, capture) => sum + toNumber(capture?.amount), 0),
    currency_code: payment.currency_code,
    order_id: payment.payment_collection?.order?.id ?? null,
    refunds: (payment.refunds ?? [])
      .filter((refund): refund is NonNullable<typeof refund> => Boolean(refund))
      .map((refund) => ({
        id: refund.id,
        amount: toNumber(refund.amount),
        note: refund.note ?? null,
        created_at: refund.created_at ? new Date(refund.created_at).toISOString() : "",
      })),
  }
}

/** Only http(s) links from carrier data end up in emails. */
function safeUrl(value: string | null | undefined): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null
}

export type { RawOrder }
