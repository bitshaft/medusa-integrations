import { COMMON_GROUP, type CopyOverrides } from "./copy"
import type { EmailsPluginOptions } from "./options"
import { listDefinitions } from "./registry"

/**
 * Settings admins change on the settings page. They are stored as rows of
 * `emails_setting` (key → JSON) and merged over the defaults from the plugin
 * options, so a store works before anyone opens the settings page.
 */

export const GENERAL_KEY = "general"
export const typeKey = (type: string) => `type:${type}`
export const copyKey = (group: string) => `copy:${group}`

/** Row `general`. */
export type StoredGeneral = {
  team_recipients?: string[]
  low_stock_threshold?: number
}

/** Row `type:<type>`. */
export type StoredType = {
  enabled?: boolean
  /** Team emails only: recipients of this alert instead of the general list. */
  recipients?: string[] | null
}

export type SettingRow = { key: string; value: unknown }

export type TypeSettings = {
  enabled: boolean
  /** True when an admin changed the toggle. */
  enabled_overridden: boolean
  recipients: string[] | null
  copy: CopyOverrides
}

export type EmailsSettings = {
  team_recipients: string[]
  /** True when the recipients come from the admin, not from the plugin options. */
  team_recipients_overridden: boolean
  low_stock_threshold: number
  low_stock_threshold_overridden: boolean
  types: Record<string, TypeSettings>
  common_copy: CopyOverrides
}

export function mergeSettings(
  options: Pick<EmailsPluginOptions, "templates" | "disabledTypes" | "team" | "lowStock">,
  rows: SettingRow[]
): EmailsSettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  const general = asObject<StoredGeneral>(byKey.get(GENERAL_KEY))
  const recipients = cleanRecipients(general.team_recipients)
  const threshold =
    typeof general.low_stock_threshold === "number" && general.low_stock_threshold >= 0
      ? Math.floor(general.low_stock_threshold)
      : null

  const types: EmailsSettings["types"] = {}
  for (const definition of listDefinitions(options)) {
    const stored = asObject<StoredType>(byKey.get(typeKey(definition.type)))
    const overridden = typeof stored.enabled === "boolean"
    types[definition.type] = {
      enabled: overridden ? (stored.enabled as boolean) : definition.defaultEnabled,
      enabled_overridden: overridden,
      recipients: definition.audience === "team" ? cleanRecipients(stored.recipients) : null,
      copy: asObject<CopyOverrides>(byKey.get(copyKey(definition.type))),
    }
  }

  return {
    team_recipients: recipients ?? options.team.recipients,
    team_recipients_overridden: recipients !== null,
    low_stock_threshold: threshold ?? options.lowStock.threshold,
    low_stock_threshold_overridden: threshold !== null,
    types,
    common_copy: asObject<CopyOverrides>(byKey.get(copyKey(COMMON_GROUP))),
  }
}

/** Who receives a store team email: the alert's own list, else the general one. */
export function teamRecipients(settings: EmailsSettings, type: string): string[] {
  const own = settings.types[type]?.recipients
  return own?.length ? own : settings.team_recipients
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export function isEmailAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL.test(value)
}

/** Valid, lower-cased, unique addresses; `null` when nothing was stored. */
export function cleanRecipients(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  return [...new Set(value.filter(isEmailAddress).map((address) => address.trim().toLowerCase()))]
}

function asObject<T>(value: unknown): T {
  return (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as T
}
