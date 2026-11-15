import { NegotiationError } from "./messages"
import type { Limits } from "./options"

/** What a customer has done recently, counted in the database. */
export type CustomerActivity = {
  open_threads: number
  threads_last_hour: number
  messages_last_hour: number
}

/** Refuses a new thread over the customer's limits. */
export function checkNewThread(limits: Limits, activity: CustomerActivity): void {
  if (activity.open_threads >= limits.openThreads) {
    throw new NegotiationError("limit_open_threads", { max: limits.openThreads })
  }
  if (activity.threads_last_hour >= limits.threadsPerHour) {
    throw new NegotiationError("limit_threads_per_hour", { max: limits.threadsPerHour })
  }
  checkNewMessage(limits, activity)
}

/** Refuses a customer message over the hourly limit. */
export function checkNewMessage(limits: Limits, activity: Pick<CustomerActivity, "messages_last_hour">): void {
  if (activity.messages_last_hour >= limits.messagesPerHour) {
    throw new NegotiationError("limit_messages_per_hour", { max: limits.messagesPerHour })
  }
}

/** Trims the text; refuses one over the length limit. Returns null for an empty message. */
export function checkBody(limits: Limits, body: string | null | undefined): string | null {
  const text = (body ?? "").trim()
  if (text.length > limits.messageLength) throw new NegotiationError("message_too_long", { max: limits.messageLength })
  return text || null
}

export function checkQuantity(limits: Limits, quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new NegotiationError("invalid_input", { details: "quantity must be a whole number of at least 1" })
  }
  if (quantity > limits.maxQuantity) throw new NegotiationError("quantity_too_large", { max: limits.maxQuantity })
}
