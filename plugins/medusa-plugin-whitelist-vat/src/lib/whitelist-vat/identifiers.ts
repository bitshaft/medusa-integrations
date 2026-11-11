/**
 * Local checks of business identifiers: normalisation, format and check
 * digits. They cost nothing and catch typos before a register is asked.
 * No Medusa imports.
 */

/** Country prefixes VIES accepts. Greece uses `EL`; `XI` is Northern Ireland. */
export const VIES_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "XI",
] as const

export type ViesCountry = (typeof VIES_COUNTRIES)[number]

/** What follows the country prefix in each member state's VAT number. */
const EU_VAT_FORMATS: Record<ViesCountry, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^[01]\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  XI: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
}

const weightedSum = (digits: string, weights: number[]) =>
  weights.reduce((sum, weight, index) => sum + weight * Number(digits[index]), 0)

/** Polish NIP: 10 digits, the last one is a check digit (mod 11, never 10). */
export function isValidNip(value: string): boolean {
  if (!/^\d{10}$/.test(value) || /^0{10}$/.test(value)) {
    return false
  }
  const check = weightedSum(value, [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11
  return check !== 10 && check === Number(value[9])
}

/** REGON: 9 digits, or 14 for local units; check digit mod 11 (10 counts as 0). */
export function isValidRegon(value: string): boolean {
  if (/^\d{9}$/.test(value)) {
    return (weightedSum(value, [8, 9, 2, 3, 4, 5, 6, 7]) % 11) % 10 === Number(value[8])
  }
  if (/^\d{14}$/.test(value)) {
    return (
      isValidRegon(value.slice(0, 9)) &&
      (weightedSum(value, [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]) % 11) % 10 === Number(value[13])
    )
  }
  return false
}

/** Polish bank account (NRB): 26 digits that pass the IBAN check with the `PL` prefix. */
export function isValidBankAccount(value: string): boolean {
  if (!/^\d{26}$/.test(value)) {
    return false
  }
  // IBAN mod 97: move the two check digits behind "PL" (P=25, L=21) and expect remainder 1.
  const rearranged = `${value.slice(2)}2521${value.slice(0, 2)}`
  let remainder = 0
  for (const digit of rearranged) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** `PL 61 1090 1014…`, `61-1090-…` → 26 digits. */
export function normalizeBankAccount(value: string): string {
  return value
    .toUpperCase()
    .replace(/^\s*PL/, "")
    .replace(/[\s-]/g, "")
}

export type TaxIdKind = "nip" | "eu_vat"

export type ParsedTaxId = {
  /** What the customer typed, trimmed. */
  input: string
  kind: TaxIdKind
  /** `PL` for a NIP, otherwise the VIES prefix (`DE`, `EL`…). */
  country_code: ViesCountry
  /** Canonical form used as the key everywhere: `5260250274` for a NIP, `DE123456789` for EU VAT. */
  number: string
  /** The part after the country prefix. */
  local: string
  valid: boolean
  /** Why it is not valid, in plain words. */
  problem?: "empty" | "unknown_country" | "format" | "checksum"
}

const ISO_TO_VIES: Record<string, ViesCountry> = { GR: "EL" }

function toViesCountry(code: string | null | undefined): ViesCountry | undefined {
  const upper = code?.trim().toUpperCase()
  if (!upper) {
    return undefined
  }
  const mapped = ISO_TO_VIES[upper] ?? upper
  return (VIES_COUNTRIES as readonly string[]).includes(mapped) ? (mapped as ViesCountry) : undefined
}

/**
 * Understands what a customer typed into a "tax ID" field:
 *
 * - `526-025-02-74`, `PL 5260250274` → a Polish NIP
 * - `DE 123456789`, `ATU12345678` → an EU VAT number
 * - digits without a prefix → the country comes from `defaultCountry`
 *   (the billing country), Poland when that is unknown
 *
 * Never throws; `valid` and `problem` say what is wrong.
 */
export function parseTaxId(input: unknown, defaultCountry?: string | null): ParsedTaxId {
  const raw = typeof input === "string" ? input.trim() : ""
  const compact = raw.toUpperCase().replace(/[\s.\-/]/g, "")
  const fallback = toViesCountry(defaultCountry) ?? "PL"

  const invalid = (problem: ParsedTaxId["problem"], country: ViesCountry, local: string): ParsedTaxId => ({
    input: raw,
    kind: country === "PL" ? "nip" : "eu_vat",
    country_code: country,
    number: country === "PL" ? local : `${country}${local}`,
    local,
    valid: false,
    problem,
  })

  if (!compact) {
    return invalid("empty", fallback, "")
  }

  let country: ViesCountry = fallback
  let local = compact
  const prefix = /^([A-Z]{2})(.+)$/.exec(compact)
  if (prefix) {
    const fromPrefix = toViesCountry(prefix[1])
    if (fromPrefix && EU_VAT_FORMATS[fromPrefix].test(prefix[2])) {
      // A real country prefix followed by something that looks like its number.
      country = fromPrefix
      local = prefix[2]
    } else if (!EU_VAT_FORMATS[fallback].test(compact)) {
      // Not a number of the fallback country either (some formats start with letters, e.g. ATU…).
      if (!fromPrefix) {
        return invalid("unknown_country", fallback, compact)
      }
      country = fromPrefix
      local = prefix[2]
    }
  }

  if (!EU_VAT_FORMATS[country].test(local)) {
    return invalid("format", country, local)
  }
  if (country === "PL" && !isValidNip(local)) {
    return invalid("checksum", country, local)
  }
  return {
    input: raw,
    kind: country === "PL" ? "nip" : "eu_vat",
    country_code: country,
    number: country === "PL" ? local : `${country}${local}`,
    local,
    valid: true,
  }
}
