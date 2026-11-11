import type { Logger, NotificationTypes } from "@medusajs/framework/types"
import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import { logPluginDisabled, parsePluginOptions, pluginDisabledError } from "../../../lib/emails/kit/options"
import { emailFromNotification, providerErrorMessage } from "../../../lib/emails/transports/from-notification"
import { SmtpTransport } from "../../../lib/emails/transports/smtp"

const NAME = "emails-smtp"

export const smtpProviderOptionsSchema = z.object({
  host: z.string().min(1),
  /** Default 587 (STARTTLS), or 465 when `secure` is true. */
  port: z.number().int().min(1).max(65535).optional(),
  /** Implicit TLS (port 465). Leave false for STARTTLS on port 587. */
  secure: z.boolean().optional(),
  user: z.string().min(1).optional(),
  password: z.string().optional(),
  /** Refuse to send unencrypted when the server has no STARTTLS. */
  requireTls: z.boolean().default(true),
  /** Sender for notifications that do not set one. The emails plugin always sets its own. */
  from: z.string().min(3).optional(),
  timeoutMs: z.number().int().positive().default(15_000),
})

export type SmtpProviderOptions = z.input<typeof smtpProviderOptionsSchema>

type InjectedDependencies = { logger: Logger }

/**
 * Notification provider that sends emails through any SMTP server.
 *
 * ```ts
 * { resolve: "@bitshaft/medusa-plugin-emails/providers/smtp", id: "smtp",
 *   options: { channels: ["email"], host: process.env.SMTP_HOST, port: 587,
 *              user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD } }
 * ```
 */
export default class EmailsSmtpProviderService extends AbstractNotificationProviderService {
  static identifier = NAME

  private readonly state_: { transport: SmtpTransport; from?: string } | { disabled: string }

  constructor({ logger }: InjectedDependencies, options: Record<string, unknown>) {
    super()
    const parsed = parsePluginOptions(smtpProviderOptionsSchema, options, { required: ["host"] })
    if (!parsed.enabled) {
      // Never block Medusa's startup over provider configuration.
      logPluginDisabled(logger, NAME, parsed.reason)
      this.state_ = { disabled: parsed.reason }
      return
    }
    const { from, ...transport } = parsed.options
    this.state_ = { from, transport: new SmtpTransport(transport) }
  }

  /** Options are checked in the constructor, where a problem disables the provider instead of stopping Medusa. */
  static validateOptions(): void {}

  async send(
    notification: NotificationTypes.ProviderSendNotificationDTO
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(NAME, this.state_.disabled)
    }
    try {
      return await this.state_.transport.send(emailFromNotification(notification, this.state_.from))
    } catch (error) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, providerErrorMessage(error))
    }
  }
}
