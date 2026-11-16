import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import { languageOf, type WarningLanguage } from "../types"

type StoreLocales = { supported_locales?: Array<{ locale_code?: string | null } | null> | null }

/**
 * The store's languages as ISO 639 codes, the plugin's default language
 * first. They come from Settings → Store when Medusa's Translation module
 * is installed; without it, only the default language.
 *
 * `strict` is for saves that drop text in other languages: when the store's
 * languages can't be read, it refuses instead of keeping only the default.
 */
export async function storeLanguages(
  container: MedusaContainer,
  base: string,
  options: { strict?: boolean } = {}
): Promise<WarningLanguage[]> {
  const languages = [base]
  if (!container.hasRegistration(Modules.TRANSLATION)) return languages
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [store],
    } = await query.graph({ entity: "store", fields: ["supported_locales.locale_code"], pagination: { take: 1 } })
    for (const entry of (store as StoreLocales | undefined)?.supported_locales ?? []) {
      const code = languageOf(entry?.locale_code)
      if (code && !languages.includes(code)) languages.push(code)
    }
  } catch (error) {
    if (options.strict) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Could not read the store's languages, so nothing was saved. Try again. (${(error as Error).message})`
      )
    }
    // Without the store's languages the default one still works.
  }
  return languages
}

/** Text only in the given languages, trimmed; empty ones are left out. */
export function onlyLanguages(
  values: Partial<Record<string, string>> | null | undefined,
  languages: readonly string[]
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const lang of languages) {
    const value = values?.[lang]?.trim()
    if (value) result[lang] = value
  }
  return result
}
