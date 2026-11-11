import type { Logger, NotificationTypes } from "@medusajs/framework/types"
import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import { logPluginDisabled, parsePluginOptions, pluginDisabledError } from "../../../lib/emails/kit/options"
import { buildUserAgent, readPackageVersion } from "../../../lib/emails/kit/package-info"
import { PACKAGE_NAME } from "../../../lib/emails/options"
import { emailFromNotification, providerErrorMessage } from "../../../lib/emails/transports/from-notification"
import { ResendClient } from "../../../lib/emails/transports/resend"

const NAME = "emails-resend"

export const resendProviderOptionsSchema = z.object({
  /** Resend API key (`re_…`) with sending access. */
  apiKey: z.string().min(1),
  /** Sender for notifications that do not set one. The emails plugin always sets its own. */
  from: z.string().min(3).optional(),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().positive().default(15_000),
  /** Extra attempts on network errors, HTTP 5xx and 429. Safe: requests carry an idempotency key. */
  maxRetries: z.number().int().min(0).max(5).default(2),
})

export type ResendProviderOptions = z.input<typeof resendProviderOptionsSchema>

type InjectedDependencies = { logger: Logger }

/**
 * Notification provider that sends emails through Resend.
 *
 * ```ts
 * { resolve: "@bitshaft/medusa-plugin-emails/providers/resend", id: "resend",
 *   options: { channels: ["email"], apiKey: process.env.RESEND_API_KEY } }
 * ```
 */
export default class EmailsResendProviderService extends AbstractNotificationProviderService {
  static identifier = NAME

  private readonly state_: { client: ResendClient; from?: string } | { disabled: string }

  constructor({ logger }: InjectedDependencies, options: Record<string, unknown>) {
    super()
    const parsed = parsePluginOptions(resendProviderOptionsSchema, options, { required: ["apiKey"] })
    if (!parsed.enabled) {
      // Never block Medusa's startup over provider configuration.
      logPluginDisabled(logger, NAME, parsed.reason)
      this.state_ = { disabled: parsed.reason }
      return
    }
    this.state_ = {
      from: parsed.options.from,
      client: new ResendClient({
        apiKey: parsed.options.apiKey,
        baseUrl: parsed.options.baseUrl,
        timeoutMs: parsed.options.timeoutMs,
        maxRetries: parsed.options.maxRetries,
        userAgent: buildUserAgent(
          "medusa-plugin-emails",
          readPackageVersion(PACKAGE_NAME, __dirname),
          "https://bitshaft.pl"
        ),
        logger,
      }),
    }
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
      return await this.state_.client.send(emailFromNotification(notification, this.state_.from))
    } catch (error) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, providerErrorMessage(error))
    }
  }
}
