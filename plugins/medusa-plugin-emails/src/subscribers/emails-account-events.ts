import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { handleEvent } from "../lib/emails/triggers"

/**
 * Welcome, password reset and email verification emails. The last two use
 * Medusa's own flows: `auth.password_reset` and `auth.verification_requested`
 * carry the token or code, which is put in the email and never stored.
 */
export default async function emailsAccountEvents({ event, container }: SubscriberArgs<Record<string, unknown>>) {
  await handleEvent(container, event.name, event.data)
}

export const config: SubscriberConfig = {
  event: ["customer.created", "auth.password_reset", "auth.verification_requested"],
  context: { subscriberId: "emails-account-events" },
}
