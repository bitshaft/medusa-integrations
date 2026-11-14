import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { awardAction, customerForNewsletter } from "../lib/loyalty/server/actions"

/**
 * Newsletter bonus, once per customer. Any plugin can emit the event with
 * `{ customer_id }` or `{ email }`; there is no dependency on a particular
 * newsletter plugin. The event name is `newsletter.subscribed` unless
 * `LOYALTY_NEWSLETTER_EVENT` names another.
 */
export default async function loyaltyNewsletter({
  event,
  container,
}: SubscriberArgs<{ customer_id?: string; email?: string }>) {
  const customerId = await customerForNewsletter(container, event.data ?? {})
  if (customerId) await awardAction(container, customerId, "newsletter")
}

export const config: SubscriberConfig = {
  event: process.env.LOYALTY_NEWSLETTER_EVENT || "newsletter.subscribed",
  context: { subscriberId: "loyalty-newsletter" },
}
