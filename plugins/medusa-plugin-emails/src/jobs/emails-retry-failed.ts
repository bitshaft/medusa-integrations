import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { describeError } from "../lib/emails/errors"
import { retryMessage } from "../lib/emails/send"
import { EMAILS_MODULE } from "../modules/emails"
import type EmailsModuleService from "../modules/emails/service"
import type { MessageRecord } from "../modules/emails/service"

const BATCH = 25

/**
 * Sends failed emails again once their waiting time is over. Only emails
 * whose failure was clear-cut are retried (see `retryable` in the send log);
 * each one gets a limited number of attempts with growing pauses.
 */
export default async function emailsRetryFailed(container: MedusaContainer) {
  const emails = container.resolve<EmailsModuleService>(EMAILS_MODULE)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!(await emails.isEnabled())) {
    return
  }

  const due = (await emails.listEmailsMessages(
    { status: "failed", retryable: true, next_retry_at: { $lte: new Date() } },
    { take: BATCH, order: { next_retry_at: "ASC" } }
  )) as unknown as MessageRecord[]

  for (const message of due) {
    try {
      await retryMessage(container, message)
    } catch (error) {
      logger.error(`[emails] Could not retry ${message.type} (${message.id}): ${describeError(error)}`)
      await emails
        .updateEmailsMessages({ id: message.id, status: "failed", retryable: false, error: describeError(error) })
        .catch(() => undefined)
    }
  }
}

export const config = {
  name: "emails-retry-failed",
  schedule: "*/2 * * * *",
}
