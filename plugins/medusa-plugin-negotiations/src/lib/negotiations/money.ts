import { MedusaError } from "@medusajs/framework/utils"

import type { OfferLine, ThreadLine } from "./types"

/**
 * Money helpers. Every amount in the plugin is an integer in the currency's
 * smallest unit (grosze, cents) with its currency code next to it. Medusa
 * keeps prices in major units ("2124.98"), so values cross that border only
 * here, as decimal strings, never through floating-point arithmetic.
 */

/** Currencies without a minor unit (ISO 4217 exponent 0). */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "isk",
  "jpy",
  "kmf",
  "krw",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
])
const THREE_DECIMAL = new Set(["bhd", "iqd", "jod", "kwd", "lyd", "omr", "tnd"])

export function minorDigits(currency: string): number {
  const code = currency.toLowerCase()
  if (ZERO_DECIMAL.has(code)) return 0
  if (THREE_DECIMAL.has(code)) return 3
  return 2
}

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message)

/** Throws unless the value is a non-negative safe integer amount. */
export function assertAmount(value: unknown, what = "amount"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalid(`${what} must be a whole, non-negative number of the smallest currency unit (e.g. grosze)`)
  }
  return value
}

/** The decimal string inside a Medusa amount: number, string or BigNumber-like object. */
function decimalString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    // Shortest round-trip form: 19.99 stays "19.99", 1e21 is rejected below.
    return String(value)
  }
  if (typeof value === "string") return value.trim()
  if (typeof value === "object") {
    const v = value as { numeric?: unknown; value?: unknown; raw?: { value?: unknown } }
    return decimalString(v.raw?.value ?? v.value ?? v.numeric)
  }
  return null
}

/**
 * A Medusa amount in major units → integer minor units, rounded half up
 * on the decimal string. `null` when the value is missing or not a number.
 */
export function toMinor(value: unknown, currency: string): number | null {
  const text = decimalString(value)
  if (text === null) return null
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) return null
  const [, sign, whole, fraction = ""] = match
  const digits = minorDigits(currency)
  const kept = fraction.slice(0, digits).padEnd(digits, "0")
  let minor = BigInt(whole + kept)
  if (fraction.length > digits && Number(fraction[digits]) >= 5) minor += 1n
  const result = Number(sign ? -minor : minor)
  return Number.isSafeInteger(result) ? result : null
}

/** Integer minor units → the decimal string Medusa takes as a price ("2124.98"). */
export function toMajor(minor: number, currency: string): string {
  assertAmount(minor)
  const digits = minorDigits(currency)
  if (!digits) return String(minor)
  const text = String(minor).padStart(digits + 1, "0")
  return `${text.slice(0, -digits)}.${text.slice(-digits)}`
}

/** unit × quantity, refusing results that are not safe integers. */
export function lineTotal(unitPrice: number, quantity: number): number {
  const total = BigInt(assertAmount(unitPrice, "unit price")) * BigInt(quantity)
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid("the amount is too large")
  return Number(total)
}

export function sumLines(lines: Array<{ unit_price: number; quantity: number }>): number {
  return lines.reduce((sum, line) => {
    const next = sum + lineTotal(line.unit_price, line.quantity)
    if (!Number.isSafeInteger(next)) throw invalid("the amount is too large")
    return next
  }, 0)
}

export function catalogTotal(lines: ThreadLine[]): number {
  return sumLines(lines.map((l) => ({ unit_price: l.catalog_unit_price, quantity: l.quantity })))
}

/**
 * How far `price` is below `catalog`, in basis points (1 = 0.01 %),
 * rounded half up. Negative when the price is above the catalog price.
 * `null` without a catalog price.
 */
export function discountBasisPoints(price: number, catalog: number): number | null {
  if (!catalog) return null
  const diff = BigInt(catalog - price) * 10_000n
  const c = BigInt(catalog)
  const q = diff / c
  const r = diff % c
  const absR = r < 0n ? -r : r
  const roundUp = absR * 2n >= c
  return Number(roundUp ? (diff < 0n ? q - 1n : q + 1n) : q)
}

/** Basis points → "12,5 %" style text pieces are formatted in the admin; here only the number. */
export const basisPointsToPercent = (bp: number) => bp / 100

/**
 * Spreads a total over the lines in proportion to their catalog value.
 * Each unit price is a whole number of grosze, so the result can be a few
 * grosze lower than requested; it is never higher. The returned lines are
 * exactly what the customer is offered, and their sum is the offer total.
 */
export function distributeTotal(lines: ThreadLine[], requested: number): OfferLine[] {
  assertAmount(requested, "total")
  if (!lines.length) return []
  const quantities = lines.map((l) => BigInt(l.quantity))
  const catalog = lines.map((l) => BigInt(l.catalog_unit_price))
  const useCatalog = catalog.some((c, i) => c * quantities[i] > 0n)
  // Without catalog prices every unit weighs the same.
  const weights = useCatalog ? catalog : lines.map(() => 1n)
  const weightTotal = weights.reduce((sum, w, i) => sum + w * quantities[i], 0n)
  const target = BigInt(requested)

  const units = weights.map((w) => (w * target) / weightTotal)
  let rest = target - units.reduce((sum, u, i) => sum + u * quantities[i], 0n)

  // One more grosz per unit on the lines with the largest remainders, while it still fits.
  const order = weights
    .map((w, i) => ({ i, remainder: (w * target) % weightTotal }))
    .sort((a, b) => (a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1))
  for (const { i } of order) {
    if (weights[i] === 0n) continue
    if (quantities[i] <= rest) {
      units[i] += 1n
      rest -= quantities[i]
    }
  }

  return lines.map((line, i) => ({
    variant_id: line.variant_id,
    quantity: line.quantity,
    unit_price: Number(units[i]),
  }))
}

/** Totals per currency, never mixing currencies. */
export function addToTotals(totals: Record<string, number>, currency: string, amount: number): Record<string, number> {
  const next = (totals[currency] ?? 0) + amount
  if (!Number.isSafeInteger(next)) throw invalid("the amount is too large")
  totals[currency] = next
  return totals
}
