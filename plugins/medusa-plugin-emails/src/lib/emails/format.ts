import { type EmailLocale, intlLocale } from "./locales"
import type { EmailFormatters } from "./types"

/** Numbers as Medusa returns them: plain numbers, numeric strings or BigNumber objects. */
export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === "object") {
    const big = value as { numeric?: unknown; numeric_?: unknown; value?: unknown }
    return toNumber(big.numeric ?? big.numeric_ ?? big.value ?? 0)
  }
  return 0
}

export function createFormatters(locale: EmailLocale, timeZone?: string): EmailFormatters {
  const tag = intlLocale(locale)
  const toDate = (value: string | Date | null | undefined) => {
    if (!value) {
      return null
    }
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return {
    money(amount, currencyCode) {
      if (amount === null || amount === undefined) {
        return ""
      }
      if (!currencyCode) {
        return new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
      }
      try {
        return new Intl.NumberFormat(tag, { style: "currency", currency: currencyCode.toUpperCase() }).format(amount)
      } catch {
        // Not an ISO 4217 code: show the number with the code as written.
        return `${new Intl.NumberFormat(tag, { minimumFractionDigits: 2 }).format(amount)} ${currencyCode.toUpperCase()}`
      }
    },
    date(value) {
      const date = toDate(value)
      return date ? new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone }).format(date) : ""
    },
    dateTime(value) {
      const date = toDate(value)
      return date ? new Intl.DateTimeFormat(tag, { dateStyle: "long", timeStyle: "short", timeZone }).format(date) : ""
    },
  }
}

type AddressLike = {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  postal_code?: string | null
  city?: string | null
  province?: string | null
  country_code?: string | null
  phone?: string | null
}

/** An address as lines for display: name, company, street, postal code and city, country, phone. */
export function addressLines(address: AddressLike | null | undefined, locale: EmailLocale): string[] {
  if (!address) {
    return []
  }
  const join = (...parts: Array<string | null | undefined>) =>
    parts
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ")
  return [
    join(address.first_name, address.last_name),
    address.company?.trim(),
    address.address_1?.trim(),
    address.address_2?.trim(),
    join(address.postal_code, address.city),
    address.province?.trim(),
    countryName(address.country_code, locale),
    address.phone?.trim(),
  ].filter((line): line is string => Boolean(line))
}

export function countryName(code: string | null | undefined, locale: EmailLocale): string | undefined {
  if (!code) {
    return undefined
  }
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** `jan.kowalski@example.com` → `j***@example.com`, for log lines. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@")
  if (at < 1) {
    return "***"
  }
  return `${address[0]}***${address.slice(at)}`
}
