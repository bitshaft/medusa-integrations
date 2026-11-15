import { lineTotal, sumLines } from "./money"
import type { OfferLine, ThreadLine } from "./types"

/** One line priced under the variant's minimum price. */
export type FloorBreach = {
  variant_id: string
  unit_price: number
  floor: number
  /** floor − unit price, per unit. */
  difference_per_unit: number
  /** The same for the whole line. */
  difference_total: number
}

export type FloorCheck = {
  /** Lines under their minimum price. */
  below: FloorBreach[]
  /** Set when the whole price is a bigger discount than the "maximum discount" setting allows. */
  max_discount: { max_basis_points: number; min_total: number; total: number; difference: number } | null
  /** Anything above: the team must confirm before the price is sent or accepted. */
  needs_confirmation: boolean
}

/**
 * Compares a price with the variants' minimum prices and with the maximum
 * discount setting. Minimum prices are internal: this result is shown only
 * in the admin and never leaves through the Store API or customer events.
 */
export function checkFloors(
  offer: OfferLine[],
  lines: ThreadLine[],
  floors: Record<string, number | undefined>,
  maxDiscountBasisPoints: number | null
): FloorCheck {
  const below: FloorBreach[] = []
  for (const line of offer) {
    const floor = floors[line.variant_id]
    if (floor === undefined || line.unit_price >= floor) continue
    below.push({
      variant_id: line.variant_id,
      unit_price: line.unit_price,
      floor,
      difference_per_unit: floor - line.unit_price,
      difference_total: lineTotal(floor - line.unit_price, line.quantity),
    })
  }

  let maxDiscount: FloorCheck["max_discount"] = null
  if (maxDiscountBasisPoints !== null) {
    const catalog = sumLines(lines.map((l) => ({ unit_price: l.catalog_unit_price, quantity: l.quantity })))
    const total = sumLines(offer)
    // The lowest total within the allowed discount, rounded up to a whole grosz.
    const num = BigInt(catalog) * BigInt(10_000 - maxDiscountBasisPoints)
    const minTotal = Number((num + 9_999n) / 10_000n)
    if (total < minTotal) {
      maxDiscount = {
        max_basis_points: maxDiscountBasisPoints,
        min_total: minTotal,
        total,
        difference: minTotal - total,
      }
    }
  }

  return { below, max_discount: maxDiscount, needs_confirmation: below.length > 0 || maxDiscount !== null }
}
