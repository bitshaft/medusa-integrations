import type { Locale } from "../options"
import { en } from "./en"
import { pl } from "./pl"
import type { Copy } from "./types"

export type { Copy, EmailCopy } from "./types"

export const COPY: Record<Locale, Copy> = { en, pl }

export const DEFAULT_CONSENT: Record<Locale, string> = { en: en.consent, pl: pl.consent }

/** Replaces `{{name}}` with its value; unknown names become empty. */
export function interpolate(text: string, variables: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, name: string) => variables[name] ?? "")
}
