import { MedusaError } from "@medusajs/framework/utils"

import type { Locale } from "./types"

/** Why a Store API request was refused, in both languages. */
export const REASONS = {
  module_disabled: {
    pl: "Ta funkcja jest chwilowo wyłączona.",
    en: "This feature is switched off at the moment.",
  },
  not_signed_in: { pl: "Zaloguj się, aby to zrobić.", en: "Sign in to do this." },
  invalid_input: {
    pl: "Sprawdź dane w formularzu: {{details}}",
    en: "Check the form: {{details}}",
  },
  consent_type_unknown: {
    pl: "Nie ma takiego rodzaju zgody: {{id}}.",
    en: "There is no consent type {{id}}.",
  },
  consent_version_outdated: {
    pl: "Treść zgody {{id}} została zmieniona. Odśwież stronę i przeczytaj nową wersję.",
    en: "The text of consent {{id}} has changed. Reload the page and read the new version.",
  },
  consent_required: {
    pl: "Zgody {{id}} nie można wycofać tutaj, bo jest wymagana. Napisz do sklepu.",
    en: "Consent {{id}} is required, so it cannot be withdrawn here. Contact the store.",
  },
  subject_missing: {
    pl: "Podaj adres e-mail albo identyfikator przeglądarki.",
    en: "Send an e-mail address or a browser identifier.",
  },
  email_required: {
    pl: "Podaj adres e-mail, na który wyślemy link potwierdzający.",
    en: "Send the e-mail address for the confirmation link.",
  },
  rate_limited: {
    pl: "Wysłano za dużo zgłoszeń. Spróbuj ponownie za {{minutes}} min.",
    en: "Too many requests. Try again in {{minutes}} min.",
  },
  token_invalid: {
    pl: "Link potwierdzający jest nieprawidłowy albo wygasł. Wyślij zgłoszenie jeszcze raz.",
    en: "The confirmation link is invalid or has expired. Submit the request again.",
  },
  product_not_found: { pl: "Nie znaleziono produktu.", en: "The product was not found." },
  variant_not_found: { pl: "Nie znaleziono wariantu.", en: "The variant was not found." },
  region_required: {
    pl: "Podaj region (region_id), aby pokazać cenę z podatkiem.",
    en: "Send the region (region_id) to show the price with tax.",
  },
  region_not_found: { pl: "Nie znaleziono regionu.", en: "The region was not found." },
} as const

export type ReasonCode = keyof typeof REASONS

export function reasonMessage(code: ReasonCode, locale: Locale, params: Record<string, string | number> = {}): string {
  return REASONS[code][locale].replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ""))
}

const TYPES: Partial<Record<ReasonCode, string>> = {
  not_signed_in: MedusaError.Types.UNAUTHORIZED,
  product_not_found: MedusaError.Types.NOT_FOUND,
  variant_not_found: MedusaError.Types.NOT_FOUND,
  region_not_found: MedusaError.Types.NOT_FOUND,
  consent_type_unknown: MedusaError.Types.NOT_FOUND,
  module_disabled: MedusaError.Types.NOT_ALLOWED,
  consent_required: MedusaError.Types.NOT_ALLOWED,
  rate_limited: MedusaError.Types.NOT_ALLOWED,
}

/**
 * A refusal with a machine-readable `code` and a message in both languages
 * ("pl / en"); routes answer in the customer's language through `localized`.
 */
export class ComplianceError extends MedusaError {
  readonly code: ReasonCode
  readonly params: Record<string, string | number>

  constructor(code: ReasonCode, params: Record<string, string | number> = {}) {
    super(
      TYPES[code] ?? MedusaError.Types.INVALID_DATA,
      `${reasonMessage(code, "pl", params)} / ${reasonMessage(code, "en", params)}`
    )
    this.code = code
    this.params = params
  }

  localized(locale: Locale): string {
    return reasonMessage(this.code, locale, this.params)
  }
}
