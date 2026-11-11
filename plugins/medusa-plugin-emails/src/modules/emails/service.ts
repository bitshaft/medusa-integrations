import type { Logger } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"

import { logPluginDisabled, pluginDisabledError } from "../../lib/emails/kit/options"
import { type EmailsPluginOptions, parseOptions, PLUGIN_NAME } from "../../lib/emails/options"
import { type EmailsSettings, mergeSettings } from "../../lib/emails/settings"
import { EmailsLowStockAlert } from "./models/low-stock-alert"
import { EmailsMessage, type MessageStatus } from "./models/message"
import { EmailsSetting } from "./models/setting"

type InjectedDependencies = { logger: Logger }

export type MessageRecord = {
  id: string
  type: string
  locale: string
  recipient: string
  subject: string | null
  status: MessageStatus
  dedupe_key: string | null
  order_id: string | null
  customer_id: string | null
  resource_type: string | null
  resource_id: string | null
  trigger_type: string | null
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

export type ClaimMessageInput = Pick<MessageRecord, "type" | "locale" | "recipient"> &
  Partial<
    Pick<
      MessageRecord,
      | "dedupe_key"
      | "order_id"
      | "customer_id"
      | "resource_type"
      | "resource_id"
      | "trigger_type"
      | "input"
      | "original_message_id"
    >
  >

/**
 * The plugin's own module: the send log, the settings changed in the admin
 * and the low stock alerts already sent. It also holds the parsed plugin
 * options for workflows, routes, jobs and subscribers.
 */
export default class EmailsModuleService extends MedusaService({
  EmailsMessage,
  EmailsSetting,
  EmailsLowStockAlert,
}) {
  protected readonly logger_: Logger
  private readonly state_: { options: EmailsPluginOptions } | { disabled: string }

  constructor(container: InjectedDependencies, options: Record<string, unknown>) {
    super(...arguments)
    this.logger_ = container.logger

    const parsed = parseOptions(options)
    if (!parsed.enabled) {
      // Never block Medusa's startup over plugin configuration.
      logPluginDisabled(container.logger, PLUGIN_NAME, parsed.reason)
      this.state_ = { disabled: parsed.reason }
      return
    }
    this.state_ = { options: parsed.options }
  }

  /** False when options are missing or invalid; see `getDisabledReason`. */
  async isEnabled(): Promise<boolean> {
    return !("disabled" in this.state_)
  }

  /** Why the plugin is disabled (safe to show: never contains option values). */
  async getDisabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getOptions(): Promise<EmailsPluginOptions> {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    }
    return this.state_.options
  }

  /* Settings -------------------------------------------------------------- */

  /** Admin settings merged over the defaults from the plugin options. */
  async getSettings(): Promise<EmailsSettings> {
    const options = await this.getOptions()
    const rows = await this.listEmailsSettings({}, { select: ["key", "value"], take: null })
    return mergeSettings(options, rows)
  }

  /** Stores one settings row; `null` removes it, so the default applies again. */
  async saveSetting(key: string, value: Record<string, unknown> | null): Promise<void> {
    const [existing] = await this.listEmailsSettings({ key }, { select: ["id"], take: 1 })
    const empty = value === null || Object.keys(value).length === 0
    if (empty) {
      if (existing) {
        await this.deleteEmailsSettings(existing.id)
      }
      return
    }
    if (existing) {
      await this.updateEmailsSettings({ id: existing.id, value })
    } else {
      await this.createEmailsSettings({ key, value })
    }
  }

  /* Send log -------------------------------------------------------------- */

  /**
   * Creates the log row for an email that is about to be sent. When a row
   * with the same dedupe key exists, the email was already handled (or is
   * being handled right now) and `duplicate` is returned instead.
   */
  async claimMessage(input: ClaimMessageInput): Promise<{ message: MessageRecord; duplicate: boolean }> {
    if (input.dedupe_key) {
      const existing = await this.findByDedupeKey_(input.dedupe_key)
      if (existing) {
        return { message: existing, duplicate: true }
      }
    }
    try {
      const created = await this.createEmailsMessages({ ...input, status: "pending" })
      return { message: created as unknown as MessageRecord, duplicate: false }
    } catch (error) {
      // Two deliveries of the same event raced; the unique index let one through.
      const existing = input.dedupe_key ? await this.findByDedupeKey_(input.dedupe_key) : null
      if (existing) {
        return { message: existing, duplicate: true }
      }
      throw error
    }
  }

  private async findByDedupeKey_(dedupeKey: string): Promise<MessageRecord | null> {
    const [existing] = await this.listEmailsMessages({ dedupe_key: dedupeKey }, { take: 1 })
    return (existing as unknown as MessageRecord) ?? null
  }
}
