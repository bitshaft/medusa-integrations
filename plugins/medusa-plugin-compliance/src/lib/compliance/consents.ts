import { createHash } from "node:crypto"

import { LAWYER_PLACEHOLDER } from "./settings"
import type { ConsentPlacement, CookieCategory } from "./types"

/** Text per store language (ISO 639: `pl`, `en`, `fr`). */
export type ConsentText = Partial<Record<string, string>>

export type ConsentVersionRecord = {
  type_key: string
  version: number
  text: ConsentText
  /** Hash of the text, so the same wording never becomes a new version. */
  text_hash: string
  created_at: Date
}

export type ConsentTypeRecord = {
  key: string
  name: ConsentText
  placement: ConsentPlacement
  required: boolean
  active: boolean
  /** For `cookies` consent types: which category this consent covers. */
  cookie_category: CookieCategory | null
}

export type ConsentEntryRecord = {
  type_key: string
  version: number
  granted: boolean
  created_at: Date
}

export const CONSENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{1,59}$/

/** Stable hash of a consent text in every language (key order and outer spaces do not matter). */
export function textHash(text: ConsentText): string {
  const normal = Object.keys(text)
    .sort()
    .map((lang) => `${lang}:${(text[lang] ?? "").trim()}`)
    .join("\n")
  return createHash("sha256").update(normal).digest("hex")
}

/**
 * The text in exactly these languages (the store's): an empty one gets the
 * lawyer placeholder, so nothing is published blank; others are dropped.
 */
export function withPlaceholders(text: ConsentText, languages: readonly string[]): ConsentText {
  const result: ConsentText = {}
  for (const lang of languages) result[lang] = text[lang]?.trim() || LAWYER_PLACEHOLDER
  return result
}

export function latestVersion(versions: ConsentVersionRecord[], typeKey: string): ConsentVersionRecord | null {
  return versions
    .filter((v) => v.type_key === typeKey)
    .reduce<ConsentVersionRecord | null>((best, v) => (!best || v.version > best.version ? v : best), null)
}

/**
 * What saving a text does: the same text keeps the current version; a
 * changed text becomes the next version. Old versions are never changed.
 */
export function planVersion(
  versions: ConsentVersionRecord[],
  typeKey: string,
  text: ConsentText
): { create: false; version: number } | { create: true; version: number; text_hash: string } {
  const latest = latestVersion(versions, typeKey)
  const hash = textHash(text)
  if (latest && latest.text_hash === hash) return { create: false, version: latest.version }
  return { create: true, version: (latest?.version ?? 0) + 1, text_hash: hash }
}

export type ConsentState = {
  type_key: string
  granted: boolean
  version: number | null
  latest_version: number | null
  at: Date | null
  /** Granted to an older text than the current one: ask again. */
  outdated: boolean
}

/** The current state of each consent type for one subject: the last entry wins. */
export function consentState(
  entries: ConsentEntryRecord[],
  types: Pick<ConsentTypeRecord, "key">[],
  versions: ConsentVersionRecord[]
): ConsentState[] {
  return types.map(({ key }) => {
    const last = entries
      .filter((e) => e.type_key === key)
      .reduce<ConsentEntryRecord | null>((best, e) => (!best || e.created_at >= best.created_at ? e : best), null)
    const latest = latestVersion(versions, key)?.version ?? null
    const granted = last?.granted ?? false
    return {
      type_key: key,
      granted,
      version: last?.version ?? null,
      latest_version: latest,
      at: last?.created_at ?? null,
      outdated: granted && latest !== null && (last?.version ?? 0) < latest,
    }
  })
}

/**
 * Which version a grant is for. Customers must have seen the current text:
 * an older version is refused (`outdated`), a missing one means "current".
 */
export function resolveGrantVersion(
  versions: ConsentVersionRecord[],
  typeKey: string,
  requested: number | undefined
): { ok: true; version: number } | { ok: false; reason: "unknown" | "outdated" } {
  const latest = latestVersion(versions, typeKey)
  if (!latest) return { ok: false, reason: "unknown" }
  if (requested !== undefined && requested !== latest.version) return { ok: false, reason: "outdated" }
  return { ok: true, version: latest.version }
}

/**
 * Entries to append when a browser's cookie choices are linked to a signed-in
 * customer: the anonymous state of each type, unless the customer already
 * has the same state.
 */
export function linkEntries(
  anonymous: ConsentEntryRecord[],
  customer: ConsentEntryRecord[],
  types: Pick<ConsentTypeRecord, "key">[],
  versions: ConsentVersionRecord[]
): Array<{ type_key: string; version: number; granted: boolean }> {
  const anon = consentState(anonymous, types, versions)
  const mine = consentState(customer, types, versions)
  return anon
    .filter((state) => state.at !== null)
    .filter((state) => {
      const own = mine.find((m) => m.type_key === state.type_key)
      // Newer choices made by the customer win over older browser ones.
      if (own?.at && state.at && own.at > state.at) return false
      return own?.granted !== state.granted || own?.version !== state.version
    })
    .map((state) => ({ type_key: state.type_key, version: state.version ?? 0, granted: state.granted }))
}
