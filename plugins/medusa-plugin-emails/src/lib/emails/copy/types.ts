import type { EmailLocale } from "../locales"

/** Text of one email type (or of the shared `common` group): key → string. */
export type CopyGroup = Record<string, string>

/** Every group of one language, keyed by email type; `common` holds shared labels. */
export type CopyDictionary = Record<string, CopyGroup>

/** Edits stored per group: only the keys that differ from the defaults. */
export type CopyOverrides = Partial<Record<EmailLocale, CopyGroup>>

/** Name of the group with labels shared by all emails. */
export const COMMON_GROUP = "common"
