import { OUTCOME_UNKNOWN } from "../errors"
import { type OutgoingEmail, TransportError } from "./types"

/** The fields of Medusa's `ProviderSendNotificationDTO` the email providers read. */
export type NotificationInput = {
  to: string
  from?: string | null
  template?: string | null
  content?: { subject?: string; html?: string; text?: string } | null
  attachments?: Array<{
    filename: string
    content: string
    content_type?: string
    disposition?: string
    id?: string
  }> | null
  provider_data?: Record<string, unknown> | null
}

const strings = (value: unknown): string[] | undefined => {
  const list = (Array.isArray(value) ? value : value ? [value] : []).filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0
  )
  return list.length ? list : undefined
}

/**
 * Maps a Medusa notification to an email. The providers send rendered
 * emails: the notification must carry `content` with a subject and a body
 * (the emails plugin always does; so can any other code).
 *
 * `provider_data` may hold `reply_to`, `cc`, `bcc`, `headers` and
 * `idempotency_key`.
 */
export function emailFromNotification(notification: NotificationInput, defaultFrom?: string): OutgoingEmail {
  const { content } = notification
  const from = notification.from ?? defaultFrom
  if (!from) {
    throw new TransportError('The notification has no sender. Pass "from" or set the provider\'s "from" option.')
  }
  if (!content?.subject || !(content.html || content.text)) {
    throw new TransportError(
      `The notification "${notification.template ?? ""}" has no rendered content. ` +
        "This provider sends emails as they are: pass content.subject with content.html or content.text."
    )
  }
  const data = notification.provider_data ?? {}
  const headers =
    data.headers && typeof data.headers === "object"
      ? Object.fromEntries(
          Object.entries(data.headers as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : undefined

  return {
    from,
    to: notification.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    replyTo: typeof data.reply_to === "string" ? data.reply_to : undefined,
    cc: strings(data.cc),
    bcc: strings(data.bcc),
    headers,
    attachments: notification.attachments?.length
      ? notification.attachments.map((file) => ({
          filename: file.filename,
          content: file.content,
          contentType: file.content_type,
          disposition: file.disposition,
          contentId: file.id,
        }))
      : undefined,
    idempotencyKey: typeof data.idempotency_key === "string" ? data.idempotency_key : undefined,
  }
}

/**
 * The message providers throw. The marker tells the emails pipeline that
 * the email may have gone out, so it is not retried automatically.
 */
export function providerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return error instanceof TransportError && error.outcomeUnknown ? `${OUTCOME_UNKNOWN} ${message}` : message
}
