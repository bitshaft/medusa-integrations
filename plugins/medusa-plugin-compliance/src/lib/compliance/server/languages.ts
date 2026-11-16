import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { languageOf, type WarningLanguage } from "../types"

type StoreLocales = { supported_locales?: Array<{ locale_code?: string | null } | null> | null }

/**
 * The store's languages as ISO 639 codes, the plugin's default language
 * first. They come from Settings → Store when Medusa's Translation module
 * is installed; without it, only the default language.
 */
export async function storeLanguages(container: MedusaContainer, base: string): Promise<WarningLanguage[]> {
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
  } catch {
    // Without the store's languages the default one still works.
  }
  return languages
}
