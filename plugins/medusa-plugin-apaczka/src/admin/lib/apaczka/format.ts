import type { ShipmentStatus } from "./api"
import { formatMinorUnits } from "./kit/format"

export { errorMessage, formatDateTime } from "./kit/format"

type BadgeColor = "green" | "red" | "blue" | "orange" | "grey" | "purple"

export const STATUS_COLORS: Record<ShipmentStatus, BadgeColor> = {
  pending: "orange",
  created: "blue",
  posted: "blue",
  in_transit: "blue",
  out_for_delivery: "purple",
  ready_for_pickup: "purple",
  delivered: "green",
  exception: "red",
  returned: "orange",
  canceled: "grey",
  claimed: "red",
  unknown: "grey",
}

/** Formats an amount in grosze as PLN. */
export function formatGrosze(value: number | null | undefined, locale: string): string {
  return formatMinorUnits(value, "PLN", locale)
}
