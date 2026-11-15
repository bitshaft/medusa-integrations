import { MedusaError } from "@medusajs/framework/utils"

/** Amounts per currency, in the smallest unit (grosze), as integers. */
export type Totals = Record<string, number>

/** Adds an integer amount to one currency; never mixes currencies and refuses non-integers. */
export function addAmount(
  totals: Totals,
  currency: string | null | undefined,
  amount: number | null | undefined
): Totals {
  if (!currency || amount == null) return totals
  if (!Number.isSafeInteger(amount))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Amounts must be whole minor units, got ${amount}`)
  const key = currency.toLowerCase()
  totals[key] = (totals[key] ?? 0) + amount
  if (!Number.isSafeInteger(totals[key]))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Total for ${key} is too large`)
  return totals
}

export function sumBy<T>(
  items: T[],
  currency: (item: T) => string | null | undefined,
  amount: (item: T) => number | null | undefined
): Totals {
  const totals: Totals = {}
  for (const item of items) addAmount(totals, currency(item), amount(item))
  return totals
}

export function mergeTotals(...all: Totals[]): Totals {
  const totals: Totals = {}
  for (const t of all) for (const [currency, amount] of Object.entries(t)) addAmount(totals, currency, amount)
  return totals
}

/** Integer share in per mille (e.g. 934 = 93.4%), or null without attempts. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part * 1000) / whole) : null
}

/** Minor units per currency: JPY-like currencies have none. Used only when formatting. */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
])

export function minorUnitDigits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? 0 : 2
}
