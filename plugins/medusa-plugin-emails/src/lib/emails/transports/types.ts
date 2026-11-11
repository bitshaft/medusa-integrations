/** An email ready to hand to a transport. No Medusa types on purpose. */
export type OutgoingEmail = {
  from: string
  to: string
  subject: string
  html?: string
  text?: string
  replyTo?: string
  cc?: string[]
  bcc?: string[]
  headers?: Record<string, string>
  attachments?: Array<{
    filename: string
    /** Base64 encoded file. */
    content: string
    contentType?: string
    disposition?: string
    /** Content ID for inline images. */
    contentId?: string
  }>
  /**
   * The same value on every attempt for one email. Transports that support
   * it use it to make sure the email is delivered once.
   */
  idempotencyKey?: string
}

/**
 * Thrown by transports. `outcomeUnknown` means the email may have been
 * sent (e.g. the connection dropped after the message was handed over), so
 * sending it again could deliver it twice.
 */
export class TransportError extends Error {
  readonly outcomeUnknown: boolean

  constructor(message: string, options: { outcomeUnknown?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = "TransportError"
    this.outcomeUnknown = options.outcomeUnknown ?? false
  }
}
