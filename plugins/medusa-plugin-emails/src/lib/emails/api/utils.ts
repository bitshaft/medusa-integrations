import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { EMAILS_MODULE } from "../../../modules/emails"
import type EmailsModuleService from "../../../modules/emails/service"
import type { MessageRecord } from "../../../modules/emails/service"
import {
  COMMON_GROUP,
  copyDefaults,
  type CopyOverrides,
  type CopySources,
  missingFields,
  resolveCopy,
  validateOverrides,
} from "../copy"
import { loadLanguages } from "../languages"
import { canonicalLocale, type EmailLanguages, type EmailLocale } from "../locales"
import type { EmailsPluginOptions } from "../options"
import { copyKeys, copyVariables, customCopyFor, getDefinition, isCopyGroup } from "../registry"
import type { EmailsSettings } from "../settings"

export function resolveEmails(req: MedusaRequest): EmailsModuleService {
  return req.scope.resolve<EmailsModuleService>(EMAILS_MODULE)
}

/**
 * The module with its options, settings and the store's languages; throws
 * the "disabled" error when the plugin is not configured.
 */
export async function resolveEnabled(req: MedusaRequest) {
  const emails = resolveEmails(req)
  const options = await emails.getOptions()
  const settings = await emails.getSettings()
  const languages = await loadLanguages(req.scope, options)
  return { emails, options, settings, languages }
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

/** The entry of `locales` with exactly this code (any case, `_` or `-`). */
const findLocale = (locales: readonly string[], value: string) => {
  const code = canonicalLocale(value)?.toLowerCase()
  return code ? locales.find((locale) => locale.toLowerCase() === code) : undefined
}

/** A language from a request: the base when none is given, otherwise one of the store's. */
export function localeParam(value: string | undefined, languages: EmailLanguages): EmailLocale {
  if (value === undefined) {
    return languages.base
  }
  const locale = findLocale(languages.locales, value)
  if (!locale) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `"${value}" is not a store language (use ${languages.locales.join(", ")})`
    )
  }
  return locale
}

/** Fields that hold several paragraphs and get a bigger input in the admin. */
const MULTILINE = new Set(["body", "footnote", "signoff", "contact"])

/** Stored edits of one group. */
export function storedCopy(settings: EmailsSettings, group: string): CopyOverrides {
  return (group === COMMON_GROUP ? settings.common_copy : settings.types[group]?.copy) ?? {}
}

function copySources(options: EmailsPluginOptions, settings: EmailsSettings, group: string): CopySources {
  return { base: options.defaultLocale, custom: customCopyFor(options, group), overrides: storedCopy(settings, group) }
}

/** Checks edits of one group against its fields, variables and the store's languages; throws on mistakes. */
export function parseCopy(
  options: EmailsPluginOptions,
  group: string,
  input: unknown,
  languages: EmailLanguages
): CopyOverrides {
  const sources = { base: options.defaultLocale, custom: customCopyFor(options, group) }
  const { overrides, errors } = validateOverrides(
    input,
    { keys: copyKeys(options, group), variables: copyVariables(options, group), locales: languages.locales },
    (locale) => copyDefaults(group, locale, sources)
  )
  if (errors.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `The text could not be saved: ${errors.join("; ")}`)
  }
  return overrides
}

/**
 * What to store when the editor saves: its edits for the store's languages,
 * plus the stored edits of languages the editor does not show (dropped from
 * the store, or hidden while the Translation module is off), so they come
 * back with the language.
 */
export function mergeHidden(stored: CopyOverrides, edits: CopyOverrides, languages: EmailLanguages): CopyOverrides {
  const hidden = Object.entries(stored).filter(([locale]) => !findLocale(languages.locales, locale))
  return { ...Object.fromEntries(hidden), ...edits }
}

const hasEdits = (overrides: CopyOverrides, languages: EmailLanguages) =>
  languages.locales.some((locale) => Object.keys(overrides[locale] ?? {}).length > 0)

/** Fields each store language still misses (they go out in the base language); 0 for the base. */
export function countMissing(
  options: EmailsPluginOptions,
  settings: EmailsSettings,
  group: string,
  languages: EmailLanguages
): Record<EmailLocale, number> {
  const sources = copySources(options, settings, group)
  const keys = copyKeys(options, group)
  return Object.fromEntries(
    languages.locales.map((locale) => [locale, missingFields(keys, group, locale, sources).length])
  )
}

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((total, count) => total + count, 0)

/**
 * The text of one group for the editor, in every store language: each field
 * with its current value, its default in that language (empty when the
 * language has none) and the original (base language) text it falls back to.
 */
export function describeCopy(
  options: EmailsPluginOptions,
  settings: EmailsSettings,
  group: string,
  languages: EmailLanguages
) {
  const sources = copySources(options, settings, group)
  const keys = copyKeys(options, group)
  const original = resolveCopy(group, languages.base, sources)
  const copy = Object.fromEntries(
    languages.locales.map((locale) => {
      const defaults = copyDefaults(group, locale, sources)
      return [
        locale,
        Object.fromEntries(
          keys.map((key) => {
            const edited = sources.overrides?.[locale]?.[key]
            return [
              key,
              {
                value: edited ?? defaults[key] ?? "",
                default: defaults[key] ?? "",
                edited: Boolean(edited),
                original: original[key] ?? "",
              },
            ]
          })
        ),
      ]
    })
  ) as Record<EmailLocale, Record<string, { value: string; default: string; edited: boolean; original: string }>>

  return {
    base_locale: languages.base,
    locales: languages.locales,
    translation_enabled: languages.translation,
    fields: keys.map((key) => ({ key, multiline: MULTILINE.has(key) })),
    variables: copyVariables(options, group),
    copy,
    missing: countMissing(options, settings, group, languages),
    edited: hasEdits(sources.overrides ?? {}, languages),
  }
}

/** One email type as the admin lists it. */
export function describeType(
  options: EmailsPluginOptions,
  settings: EmailsSettings,
  type: string,
  languages: EmailLanguages
) {
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
    edited: hasEdits(state.copy, languages),
    /** Untranslated fields, summed over the store's languages. */
    missing_translations: sum(countMissing(options, settings, type, languages)),
  }
}

/** The shared labels as the admin lists them. */
export function describeCommon(options: EmailsPluginOptions, settings: EmailsSettings, languages: EmailLanguages) {
  return {
    edited: hasEdits(settings.common_copy, languages),
    missing_translations: sum(countMissing(options, settings, COMMON_GROUP, languages)),
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
