import { exchangeRate } from "./money"

export type CodShareInput = {
  /** Order total, in the order currency (major units). */
  orderTotal: number
  /** Already paid on the order (captured), in the order currency. */
  paidTotal: number
  currencyCode: string
  /** PLN → currency multipliers from `pricing.exchangeRates`. */
  exchangeRates: Record<string, number>
  /** Value of the items in this shipment (unit price × quantity). */
  shipmentItemsValue: number
  /** Value of all shippable items on the order. */
  orderItemsValue: number
  /** True when nothing is left to fulfil after this shipment. */
  isLastShipment: boolean
  /** COD already set on other active shipments of the order, PLN major units. */
  alreadyScheduledPln: number
}

/**
 * How much this shipment should collect on delivery, in PLN (major units).
 *
 * - Only what the customer still owes is collected (total minus payments).
 * - Shipments other than the last collect a share proportional to their
 *   items' value. Tax, discounts and shipping are spread the same way.
 * - The last shipment collects whatever is left, so all shipments together
 *   always add up to exactly what is owed, with no rounding drift.
 * - Amounts in other currencies are converted with `pricing.exchangeRates`.
 */
export function codShareForShipment(input: CodShareInput): number {
  const rate = exchangeRate(input.currencyCode, input.exchangeRates)
  const toPln = (amount: number) => amount / rate

  const outstandingPln = toPln(Math.max(0, input.orderTotal - input.paidTotal))
  const remainingPln = Math.max(0, outstandingPln - input.alreadyScheduledPln)

  if (input.isLastShipment || input.orderItemsValue <= 0) {
    return roundToGrosz(remainingPln)
  }

  const ratio = Math.min(1, Math.max(0, input.shipmentItemsValue / input.orderItemsValue))
  return roundToGrosz(Math.min(outstandingPln * ratio, remainingPln))
}

function roundToGrosz(value: number): number {
  return Math.round(value * 100) / 100
}
