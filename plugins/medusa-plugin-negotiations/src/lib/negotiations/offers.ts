import { assertAmount, distributeTotal, lineTotal, sumLines } from "./money"
import { NegotiationError } from "./messages"
import type { CartCounterModes, Offer, OfferLine, OfferMode, ThreadKind, ThreadLine } from "./types"

/** A price as the team or the customer sends it. */
export type PriceInput =
  | { mode: "unit"; unit_price: number }
  | { mode: "total"; total: number }
  | { mode: "lines"; lines: Array<{ variant_id: string; unit_price: number }> }

/** Modes the team may choose for a counter-offer on this thread. */
export function allowedOfferModes(kind: ThreadKind, cartModes: CartCounterModes): OfferMode[] {
  if (kind === "product") return ["unit"]
  return cartModes === "both" ? ["total", "lines"] : [cartModes]
}

/**
 * Turns a price input into an offer the customer can accept as it is: unit
 * prices in whole grosze, the total being their exact sum. For one amount
 * over a cart the result can be a few grosze lower than typed, never higher.
 */
export function buildOffer(lines: ThreadLine[], input: PriceInput): Offer {
  if (!lines.length) throw new NegotiationError("invalid_input", { details: "the thread has no lines" })
  if (input.mode === "unit") {
    if (lines.length !== 1) throw new NegotiationError("mode_not_allowed", { mode: input.mode })
    const unit = assertAmount(input.unit_price, "unit_price")
    const offerLines = [{ variant_id: lines[0].variant_id, quantity: lines[0].quantity, unit_price: unit }]
    return { mode: "unit", lines: offerLines, total: lineTotal(unit, lines[0].quantity) }
  }
  if (input.mode === "total") {
    const requested = assertAmount(input.total, "total")
    if (requested <= 0) throw new NegotiationError("price_required")
    const offerLines = distributeTotal(lines, requested)
    return { mode: "total", lines: offerLines, total: sumLines(offerLines), requested_total: requested }
  }
  const byVariant = new Map(input.lines.map((l) => [l.variant_id, l]))
  if (byVariant.size !== input.lines.length || byVariant.size !== lines.length) {
    throw new NegotiationError("lines_mismatch")
  }
  const offerLines: OfferLine[] = lines.map((line) => {
    const priced = byVariant.get(line.variant_id)
    if (!priced) throw new NegotiationError("lines_mismatch")
    return {
      variant_id: line.variant_id,
      quantity: line.quantity,
      unit_price: assertAmount(priced.unit_price, "unit_price"),
    }
  })
  return { mode: "lines", lines: offerLines, total: sumLines(offerLines) }
}

/**
 * The customer's target price: per unit on a product thread, one amount on
 * a cart thread (spread over the lines like a team's single amount).
 */
export function buildTarget(kind: ThreadKind, lines: ThreadLine[], price: number): Offer {
  return kind === "product"
    ? buildOffer(lines, { mode: "unit", unit_price: price })
    : buildOffer(lines, { mode: "total", total: price })
}

/** Whether a stored offer still describes exactly these lines (variants and quantities). */
export function offerMatchesLines(offer: Offer, lines: ThreadLine[]): boolean {
  if (offer.lines.length !== lines.length) return false
  return lines.every((line) =>
    offer.lines.some((o) => o.variant_id === line.variant_id && o.quantity === line.quantity)
  )
}
