import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { canonicalLocale, type EmailLanguages } from "./locales"
import type { EmailsPluginOptions } from "./options"

type StoreLocales = { supported_locales?: Array<{ locale_code?: string | null } | null> | null }

/**
 * The languages emails are written and sent in. With Medusa's Translation
 * module installed they are the base language (`defaultLocale` option) plus
 * the store's languages (Settings → Store); without it, only the base.
 *
 * Read on every call, so a language added in the admin applies at once.
 */
export async function loadLanguages(
  container: MedusaContainer,
  options: Pick<EmailsPluginOptions, "defaultLocale">
): Promise<EmailLanguages> {
  const base = options.defaultLocale
  if (!container.hasRegistration(Modules.TRANSLATION)) {
    return { base, locales: [base], translation: false }
  }

  let codes: Array<string | null | undefined> = []
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [store],
    } = await query.graph({ entity: "store", fields: ["supported_locales.locale_code"], pagination: { take: 1 } })
    codes = ((store as StoreLocales | undefined)?.supported_locales ?? []).map((locale) => locale?.locale_code)
  } catch {
    // Without the store's languages, emails still go out in the base language.
  }

  const locales = [base]
  const seen = new Set([base.toLowerCase()])
  for (const raw of codes) {
    const code = canonicalLocale(raw)
    if (code && !seen.has(code.toLowerCase())) {
      seen.add(code.toLowerCase())
      locales.push(code)
    }
  }
  return { base, locales, translation: true }
}
