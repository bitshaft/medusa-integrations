import type { ShipmentStatus } from "./api"

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
  if (value === null || value === undefined) {
    return "—"
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" }).format(value / 100)
}

export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) {
    return "—"
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

/** Pulls a readable message out of a js-sdk FetchError or any error. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}
