import { createHash } from "node:crypto"

import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { sendEmailsMessageWorkflow } from "../../workflows/emails/send-emails-message"
import { describeError } from "./errors"
import { EmailsEvents } from "./events"
import { PLUGIN_NAME } from "./options"
import { sendEmail, type SendEmailInput } from "./send"

type EventData = Record<string, unknown>

const id = (value: unknown): string | null => (typeof value === "string" && value ? value : null)

/** A key that changes with the secret without revealing it. */
const fingerprint = (...parts: unknown[]) =>
  createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex")
    .slice(0, 32)

/**
 * Which emails an event sends. Every email has a dedupe key built from the
 * event's resource, so an event that is delivered twice sends one email.
 */
export function emailsForEvent(name: string, data: EventData): SendEmailInput[] {
  const keyed = (type: string, input: EventData, key: string | null): SendEmailInput => ({
    type,
    data: input,
    dedupeKey: key ? `${type}:${key}` : null,
    trigger: name,
  })
  const fulfillment = { fulfillment_id: data.id, no_notification: data.no_notification === true }

  switch (name) {
    case "order.placed":
      return [
        keyed("order-confirmation", { order_id: data.id }, id(data.id)),
        keyed("team-new-order", { order_id: data.id }, id(data.id)),
      ]
    case "order.canceled":
      return [keyed("order-canceled", { order_id: data.id }, id(data.id))]
    case "order.return_requested":
      return [keyed("return-requested", { order_id: data.order_id, return_id: data.return_id }, id(data.return_id))]
    case "order.return_received":
      return [keyed("return-accepted", { order_id: data.order_id, return_id: data.return_id }, id(data.return_id))]
    case "order.fulfillment_created":
      return [
        keyed(
          "order-fulfilled",
          { fulfillment_id: data.fulfillment_id, no_notification: data.no_notification === true },
          id(data.fulfillment_id)
        ),
      ]
    case "shipment.created":
      return [keyed("order-shipped", fulfillment, id(data.id))]
    case "delivery.created":
      return [keyed("order-delivered", fulfillment, id(data.id))]
    case "payment.captured":
      return [keyed("payment-received", { payment_id: data.id }, id(data.id))]
    case "payment.refunded":
      // The loader narrows the key down to the refund, so each refund of a payment gets its email.
      return [keyed("refund-issued", { payment_id: data.id }, id(data.id))]
    case "customer.created":
      return [keyed("welcome", { customer_id: data.id }, id(data.id))]
    case "auth.password_reset": {
      const key = data.token ? fingerprint(data.entity_id, data.token) : null
      return [{ ...keyed("password-reset", data, key), sensitive: true }]
    }
    case "auth.verification_requested": {
      const key = data.code ? fingerprint(data.entity_id, data.code, data.expires_at) : null
      return [{ ...keyed("email-verification", data, key), sensitive: true }]
    }
    case EmailsEvents.PAYMENT_FAILED:
      return [keyed("team-payment-failed", data, id(data.payment_id))]
    default:
      return []
  }
}

/**
 * Sends the emails of one event. Problems are logged, never thrown: a
 * broken email must not make Medusa redeliver the event to other
 * subscribers, and the send log keeps what went wrong.
 */
export async function handleEvent(container: MedusaContainer, name: string, data: EventData | undefined) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  for (const input of emailsForEvent(name, data ?? {})) {
    try {
      if (input.sensitive) {
        // Tokens and codes stay out of workflow executions.
        await sendEmail(container, input)
      } else {
        await sendEmailsMessageWorkflow(container).run({ input })
      }
    } catch (error) {
      logger.error(`[${PLUGIN_NAME}] Could not send ${input.type} for ${name}: ${describeError(error)}`)
    }
  }
}
