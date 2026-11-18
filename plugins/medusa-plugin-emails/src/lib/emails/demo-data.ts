import { DEFAULT_COPY, interpolate } from "./copy"
import type { EmailLocale } from "./locales"

/**
 * Test data for the send log in demo mode: a month of history over the
 * store's own orders and customers, with every email type and every status
 * (sent, failed with the reason, pending, demo) and a resend. Nothing is
 * sent: these are log rows only.
 *
 * Rows are marked by their dedupe key (`demo-data:<n>`), so "Restore test
 * data" replaces them and never touches real log entries.
 */

export const DEMO_KEY_PREFIX = "demo-data:"

export type DemoOrder = {
  id: string
  display_id: number | null
  email: string
  customer_id: string | null
  /** Formatted, e.g. `249,00 zł`. */
  total: string
  locale: EmailLocale
  /** Real Medusa order: its emails can be resent and previewed. */
  real: boolean
}

export type DemoCustomer = { id: string; email: string; locale: EmailLocale }

export type DemoMessage = {
  id: string
  type: string
  locale: string
  recipient: string
  subject: string | null
  status: "pending" | "sent" | "failed" | "demo"
  dedupe_key: string
  order_id: string | null
  customer_id: string | null
  resource_type: string | null
  resource_id: string | null
  trigger_type: string
  input: Record<string, unknown> | null
  attempts: number
  retryable: boolean
  next_retry_at: Date | null
  error: string | null
  notification_id: string | null
  original_message_id: string | null
  sent_at: Date | null
  created_at: Date
}

export type DemoInput = {
  now: Date
  orders: DemoOrder[]
  customers: DemoCustomer[]
  team: string[]
  storeName: string
  defaultLocale: EmailLocale
  id: (prefix: string) => string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Errors as transports report them, so the log shows what a real failure looks like. */
const ERRORS = {
  mailbox: "550 5.1.1 <{{email}}>: Recipient address rejected: User unknown in virtual mailbox table",
  timeout: "SMTP connection timed out after 15000 ms (smtp.example.com:587)",
  quota: "452 4.2.2 Mailbox full: the receiver's mailbox is over quota",
}

export function buildDemoMessages(input: DemoInput): DemoMessage[] {
  const { now, id } = input
  const team = input.team.length ? input.team : ["zespol@example.com"]
  const messages: DemoMessage[] = []
  let n = 0

  const subject = (type: string, locale: EmailLocale, vars: Record<string, string | number | null>) => {
    const text = (DEFAULT_COPY[locale] ?? DEFAULT_COPY.en)[type]?.subject
    return text ? interpolate(text, { store_name: input.storeName, ...vars }) : null
  }
  const add = (
    message: Pick<DemoMessage, "type" | "recipient" | "trigger_type" | "created_at"> &
      Partial<DemoMessage> & { locale: EmailLocale; vars?: Record<string, string | number | null> }
  ): DemoMessage => {
    const { vars, ...rest } = message
    const status = rest.status ?? "sent"
    const row: DemoMessage = {
      id: id("emsg"),
      subject: subject(rest.type, rest.locale, vars ?? {}),
      status,
      dedupe_key: `${DEMO_KEY_PREFIX}${++n}`,
      order_id: null,
      customer_id: null,
      resource_type: null,
      resource_id: null,
      input: null,
      attempts: status === "pending" ? 0 : 1,
      // Never picked up by the retry job: demo rows only show what a failure looks like.
      retryable: false,
      next_retry_at: null,
      error: null,
      notification_id: status === "sent" ? id("noti") : null,
      original_message_id: null,
      sent_at: status === "sent" ? new Date(rest.created_at.getTime() + 2_000) : null,
      ...rest,
    }
    messages.push(row)
    return row
  }

  // Oldest order first, spread over the last 28 days.
  const orders = [...input.orders].slice(0, 12)
  orders.forEach((order, index) => {
    const placed = new Date(now.getTime() - (orders.length - index) * (28 / Math.max(orders.length, 1)) * DAY)
    const at = (offset: number) => new Date(placed.getTime() + offset)
    const vars = {
      order_number: order.display_id != null ? `#${order.display_id}` : order.id,
      order_total: order.total,
    }
    const base = {
      order_id: order.id,
      customer_id: order.customer_id,
      resource_type: "order",
      resource_id: order.id,
      locale: order.locale,
      vars,
    }
    const resendable = order.real ? { order_id: order.id } : null
    const newest = index === orders.length - 1
    const age = now.getTime() - placed.getTime()

    if (newest) {
      // Just placed: the confirmation is still on its way.
      add({
        ...base,
        type: "order-confirmation",
        recipient: order.email,
        trigger_type: "order.placed",
        status: "pending",
        input: resendable,
        created_at: new Date(now.getTime() - 40_000),
      })
      add({
        ...base,
        type: "team-new-order",
        recipient: team[0],
        trigger_type: "order.placed",
        input: resendable,
        created_at: new Date(now.getTime() - 40_000),
        status: "pending",
        locale: input.defaultLocale,
      })
      return
    }

    const confirmation = add({
      ...base,
      type: "order-confirmation",
      recipient: order.email,
      trigger_type: "order.placed",
      input: resendable,
      created_at: at(0),
      ...(index === 1 ? { status: "failed", error: interpolate(ERRORS.mailbox, { email: order.email }) } : {}),
    })
    if (index === 1) {
      // The team fixed the address and resent it.
      add({
        ...base,
        type: "order-confirmation",
        recipient: order.email,
        trigger_type: "resend",
        input: resendable,
        original_message_id: confirmation.id,
        created_at: at(3 * HOUR),
      })
    }
    for (const recipient of team) {
      add({
        ...base,
        locale: input.defaultLocale,
        type: "team-new-order",
        recipient,
        trigger_type: "order.placed",
        input: resendable,
        created_at: at(1_000),
        ...(index === 3 ? { status: "failed", attempts: 3, error: ERRORS.timeout } : {}),
      })
    }

    if (index === 2) {
      add({
        ...base,
        type: "order-canceled",
        recipient: order.email,
        trigger_type: "order.canceled",
        input: resendable,
        created_at: at(5 * HOUR),
      })
      add({
        ...base,
        type: "refund-issued",
        recipient: order.email,
        trigger_type: "payment.refunded",
        created_at: at(6 * HOUR),
        vars: { ...vars, refund_amount: order.total },
      })
      return
    }
    add({
      ...base,
      type: "payment-received",
      recipient: order.email,
      trigger_type: "payment.captured",
      created_at: at(10 * MINUTE),
      vars: { ...vars, amount: order.total },
    })
    if (age < DAY) return
    add({
      ...base,
      type: "order-fulfilled",
      recipient: order.email,
      trigger_type: "order.fulfillment_created",
      created_at: at(20 * HOUR),
    })
    add({
      ...base,
      type: "order-shipped",
      recipient: order.email,
      trigger_type: "shipment.created",
      created_at: at(DAY),
      vars: { ...vars, tracking_number: `DEMO${100000 + index}` },
      ...(index === 4 ? { status: "failed", error: ERRORS.quota } : {}),
    })
    if (age < 3 * DAY) return
    add({
      ...base,
      type: "order-delivered",
      recipient: order.email,
      trigger_type: "delivery.created",
      created_at: at(3 * DAY),
      vars: { ...vars, tracking_number: `DEMO${100000 + index}` },
    })
    if (index === 0) {
      add({
        ...base,
        type: "return-requested",
        recipient: order.email,
        trigger_type: "order.return_requested",
        created_at: at(5 * DAY),
      })
      add({
        ...base,
        type: "return-accepted",
        recipient: order.email,
        trigger_type: "order.return_received",
        created_at: at(8 * DAY),
      })
      add({
        ...base,
        type: "refund-issued",
        recipient: order.email,
        trigger_type: "payment.refunded",
        created_at: at(8 * DAY + HOUR),
        vars: { ...vars, refund_amount: order.total },
      })
    }
  })

  // Accounts: welcome emails, a verification code and a password reset (never resendable: they carry a secret).
  input.customers.slice(0, 6).forEach((customer, index) => {
    const at = new Date(now.getTime() - (30 - index * 4) * DAY)
    const account = {
      customer_id: customer.id,
      resource_type: "customer",
      resource_id: customer.id,
      locale: customer.locale,
    }
    add({
      ...account,
      type: "welcome",
      recipient: customer.email,
      trigger_type: "customer.created",
      input: { customer_id: customer.id },
      created_at: at,
    })
    if (index === 0) {
      add({
        ...account,
        type: "email-verification",
        recipient: customer.email,
        trigger_type: "auth.verification_requested",
        created_at: new Date(at.getTime() - 5 * MINUTE),
      })
    }
    if (index === 1) {
      add({
        ...account,
        type: "password-reset",
        recipient: customer.email,
        trigger_type: "auth.password_reset",
        created_at: new Date(now.getTime() - 9 * DAY),
      })
    }
  })

  // Store team alerts.
  add({
    type: "team-low-stock",
    recipient: team[0],
    trigger_type: "emails-low-stock",
    locale: input.defaultLocale,
    created_at: new Date(now.getTime() - 2 * DAY),
    vars: { count: 3, threshold: 5 },
  })
  add({
    type: "team-payment-failed",
    recipient: team[0],
    trigger_type: "emails.payment.failed",
    locale: input.defaultLocale,
    created_at: new Date(now.getTime() - 6 * DAY),
    vars: { amount: orders[0]?.total ?? "" },
  })
  // A test sent from the template editor in demo mode.
  add({
    type: "order-confirmation",
    recipient: team[0],
    trigger_type: "test",
    status: "demo",
    locale: input.defaultLocale,
    created_at: new Date(now.getTime() - 3 * HOUR),
    vars: { order_number: "#1001", order_total: orders[0]?.total ?? "" },
  })

  return messages.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
}
