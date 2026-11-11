import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { EMAILS_MODULE } from "../../../modules/emails"
import type EmailsModuleService from "../../../modules/emails/service"
import type { MessageRecord } from "../../../modules/emails/service"
import { COMMON_GROUP, type CopyOverrides, resolveCopy, validateOverrides } from "../copy"
import { type EmailLocale, LOCALES } from "../locales"
import type { EmailsPluginOptions } from "../options"
import { copyKeys, copyVariables, customCopyFor, getDefinition, isCopyGroup } from "../registry"
import type { EmailsSettings } from "../settings"

export function resolveEmails(req: MedusaRequest): EmailsModuleService {
  return req.scope.resolve<EmailsModuleService>(EMAILS_MODULE)
}

/** The module with its options and settings; throws the "disabled" error when the plugin is not configured. */
export async function resolveEnabled(req: MedusaRequest) {
  const emails = resolveEmails(req)
  const options = await emails.getOptions()
  const settings = await emails.getSettings()
  return { emails, options, settings }
}

/** The `:type` URL parameter, which must be an email type (or `common` where allowed). */
export function groupParam(req: MedusaRequest, options: EmailsPluginOptions, config: { allowCommon?: boolean } = {}) {
  const group = req.params.type
  const known = config.allowCommon ? isCopyGroup(options, group) : Boolean(getDefinition(options, group))
  if (!known) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Email type "${group}" does not exist`)
  }
  return group
}

/** Fields that hold several paragraphs and get a bigger input in the admin. */
const MULTILINE = new Set(["body", "footnote", "signoff", "contact"])

/** Stored edits of one group. */
export function storedCopy(settings: EmailsSettings, group: string): CopyOverrides {
  return (group === COMMON_GROUP ? settings.common_copy : settings.types[group]?.copy) ?? {}
}

/** Checks edits of one group against its fields and variables; throws on mistakes. */
export function parseCopy(options: EmailsPluginOptions, group: string, input: unknown): CopyOverrides {
  const { overrides, errors } = validateOverrides(
    input,
    { keys: copyKeys(options, group), variables: copyVariables(options, group) },
    (locale) => resolveCopy(group, locale, { custom: customCopyFor(options, group) })
  )
  if (errors.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `The text could not be saved: ${errors.join("; ")}`)
  }
  return overrides
}

/** The text of one group for the editor: every field with its current value and its default. */
export function describeCopy(options: EmailsPluginOptions, settings: EmailsSettings, group: string) {
  const overrides = storedCopy(settings, group)
  const custom = customCopyFor(options, group)
  const keys = copyKeys(options, group)
  const copy = Object.fromEntries(
    LOCALES.map((locale: EmailLocale) => {
      const defaults = resolveCopy(group, locale, { custom })
      return [
        locale,
        Object.fromEntries(
          keys.map((key) => {
            const edited = overrides[locale]?.[key]
            return [
              key,
              { value: edited ?? defaults[key] ?? "", default: defaults[key] ?? "", edited: Boolean(edited) },
            ]
          })
        ),
      ]
    })
  ) as Record<EmailLocale, Record<string, { value: string; default: string; edited: boolean }>>

  return {
    fields: keys.map((key) => ({ key, multiline: MULTILINE.has(key) })),
    variables: copyVariables(options, group),
    copy,
    edited: LOCALES.some((locale) => Object.keys(overrides[locale] ?? {}).length > 0),
  }
}

/** One email type as the admin lists it. */
export function describeType(options: EmailsPluginOptions, settings: EmailsSettings, type: string) {
  const definition = getDefinition(options, type)!
  const state = settings.types[type]
  return {
    type,
    audience: definition.audience,
    custom: definition.custom,
    sensitive: definition.sensitive,
    enabled: state.enabled,
    default_enabled: definition.defaultEnabled,
    recipients: state.recipients,
    edited: LOCALES.some((locale) => Object.keys(state.copy[locale] ?? {}).length > 0),
  }
}

/** A send log row without the stored loader input. */
export function describeMessage(options: EmailsPluginOptions, message: MessageRecord) {
  const definition = getDefinition(options, message.type)
  return {
    id: message.id,
    type: message.type,
    locale: message.locale,
    recipient: message.recipient,
    subject: message.subject,
    status: message.status,
    order_id: message.order_id,
    customer_id: message.customer_id,
    trigger_type: message.trigger_type,
    attempts: message.attempts,
    retryable: message.retryable,
    next_retry_at: message.next_retry_at,
    error: message.error,
    original_message_id: message.original_message_id,
    sent_at: message.sent_at,
    created_at: message.created_at,
    resendable: Boolean(definition) && !definition!.sensitive && message.input !== null,
  }
}
