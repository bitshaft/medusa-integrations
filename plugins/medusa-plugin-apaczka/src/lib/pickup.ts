import type { ApaczkaClient, ApaczkaLogger, ApaczkaOrderPickup } from "./apaczka"
import type { ApaczkaFulfillmentOption } from "./fulfillment-options"
import type { PickupOptions } from "./options"

/**
 * Decides how the parcel reaches the carrier.
 *
 * - Services that require a courier (`pickup_courier = 2`) always get one.
 * - Services without courier pickup (`0`) are always `SELF`.
 * - Otherwise the configured `pickup.type` wins.
 *
 * For a courier, the first available day from `pickup_hours` (at least
 * `minDaysAhead` days out) is used with the configured time window.
 */
export async function resolvePickup(input: {
  client: ApaczkaClient
  option: ApaczkaFulfillmentOption
  serviceId: number
  senderPostalCode: string
  pickup: PickupOptions
  logger?: ApaczkaLogger
  now?: Date
}): Promise<ApaczkaOrderPickup> {
  const { option, pickup } = input
  const wantsCourier = option.pickup_courier === 2 || (option.pickup_courier === 1 && pickup.type === "COURIER")

  if (!wantsCourier || option.origin === "point") {
    return { type: "SELF" }
  }

  const earliest = addDays(startOfDay(input.now ?? new Date()), pickup.minDaysAhead)
  const fallbackDate = formatDate(nextBusinessDay(earliest))

  let date = fallbackDate
  try {
    const { days } = await input.client.getPickupHours({
      postal_code: input.senderPostalCode,
      service_id: input.serviceId,
    })
    const available = days
      .map((day) => day.date)
      .filter((day) => day >= formatDate(earliest))
      .sort()
    date = available[0] ?? fallbackDate
  } catch (error) {
    input.logger?.warn(
      `[apaczka] Could not fetch pickup hours for ${input.senderPostalCode}; using ${fallbackDate}: ${(error as Error).message}`
    )
  }

  return { type: "COURIER", date, hours_from: pickup.hoursFrom, hours_to: pickup.hoursTo }
}

export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function nextBusinessDay(date: Date): Date {
  const copy = new Date(date)
  while (copy.getDay() === 0 || copy.getDay() === 6) {
    copy.setDate(copy.getDate() + 1)
  }
  return copy
}
