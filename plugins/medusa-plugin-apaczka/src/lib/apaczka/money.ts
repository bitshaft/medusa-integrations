import { MedusaError } from "@medusajs/framework/utils"

import type { PricingOptions } from "./options"

/** Medusa amounts are decimals in major units; Apaczka uses integer grosze. */
export function toGrosze(amount: number | string | { toString(): string } | null | undefined): number {
  const value = Number(typeof amount === "object" && amount !== null ? amount.toString() : amount)
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(value * 100)
}

export function fromGrosze(grosze: number): number {
  return Math.round(grosze) / 100
}

/** Parses Apaczka's decimal price strings (`"12.20"`) into grosze. */
export function decimalStringToGrosze(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const parsed = Number(String(value).replace(",", "."))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

/**
 * Turns an Apaczka quote (grosze, PLN) into the amount charged to the
 * customer (major units, cart currency), applying markups, rounding and the
 * free-shipping threshold.
 */
export function priceForCustomer(input: {
  quote: { price: number; price_gross: number }
  currencyCode: string
  pricing: PricingOptions
  /** Cart item subtotal in major units, for the free-shipping threshold. */
  cartSubtotal?: number
}): number {
  const { pricing } = input

  if (
    pricing.freeShippingThreshold !== undefined &&
    input.cartSubtotal !== undefined &&
    input.cartSubtotal >= pricing.freeShippingThreshold
  ) {
    return 0
  }

  const basePln = fromGrosze(pricing.basis === "net" ? input.quote.price : input.quote.price_gross)
  const converted = basePln * exchangeRate(input.currencyCode, pricing.exchangeRates)

  let amount = converted * (1 + pricing.markupPercent / 100) + pricing.markupFixed
  if (pricing.roundUpTo) {
    // Work in cents to avoid float drift like 12.000000001 → 13.
    const step = Math.round(pricing.roundUpTo * 100)
    amount = (Math.ceil(Math.round(amount * 100) / step) * step) / 100
  }

  return Math.max(0, Math.round(amount * 100) / 100)
}

export function exchangeRate(currencyCode: string, rates: Record<string, number>): number {
  const code = currencyCode.toLowerCase()
  if (code === "pln") {
    return 1
  }
  const rate = rates[code] ?? rates[code.toUpperCase()]
  if (!rate) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Apaczka prices are in PLN, but the cart is in ${code.toUpperCase()}. ` +
        `Add pricing.exchangeRates.${code} to the plugin options, or use flat-rate shipping options for this currency.`
    )
  }
  return rate
}
