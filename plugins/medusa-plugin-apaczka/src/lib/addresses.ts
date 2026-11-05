import { MedusaError } from "@medusajs/framework/utils"

import type { ApaczkaAddress } from "./apaczka"
import type { SenderOptions } from "./options"

/** Medusa address shape (cart, order, stock location) — every field optional. */
export type MedusaAddressLike = {
  company?: string | null
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  postal_code?: string | null
  country_code?: string | null
  province?: string | null
  phone?: string | null
}

export type StockLocationLike = {
  id?: string
  name?: string | null
  address?: MedusaAddressLike | null
}

/** The customer side of a shipment (receiver, or sender on returns). */
export function customerAddress(
  address: MedusaAddressLike | null | undefined,
  email: string | null | undefined,
  pointId?: string
): ApaczkaAddress {
  if (!address) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A shipping address is required for Apaczka shipments")
  }

  const person = [address.first_name, address.last_name].filter(Boolean).join(" ").trim()
  const name = address.company?.trim() || person

  return compact({
    name,
    contact_person: person || undefined,
    line1: address.address_1?.trim() ?? "",
    line2: address.address_2?.trim() || undefined,
    postal_code: formatPostalCode(address.postal_code, address.country_code),
    city: address.city?.trim() ?? "",
    country_code: (address.country_code ?? "pl").toUpperCase(),
    state_code: address.province?.trim() || undefined,
    phone: normalizePhone(address.phone),
    email: email ?? undefined,
    is_residential: !address.company,
    foreign_address_id: pointId,
  })
}

/**
 * The warehouse side of a shipment. Precedence (highest first):
 * per-location overrides → the stock location's address → global defaults.
 */
export function warehouseAddress(input: {
  location?: StockLocationLike | null
  defaults: SenderOptions
  overrides?: SenderOptions
}): ApaczkaAddress {
  const { defaults, overrides = {} } = input
  const address = input.location?.address ?? {}

  const pick = <K extends keyof SenderOptions>(key: K, fromLocation?: SenderOptions[K] | null) =>
    overrides[key] ?? (fromLocation || undefined) ?? defaults[key]

  const countryCode = (pick("countryCode", address.country_code) ?? "PL").toUpperCase()

  return compact({
    name: pick("name", address.company || input.location?.name) ?? "",
    contact_person: pick("contactPerson"),
    line1: pick("line1", address.address_1) ?? "",
    line2: pick("line2", address.address_2),
    postal_code: formatPostalCode(pick("postalCode", address.postal_code), countryCode),
    city: pick("city", address.city) ?? "",
    country_code: countryCode,
    phone: normalizePhone(pick("phone", address.phone)),
    email: pick("email"),
    is_residential: pick("isResidential") ?? false,
    foreign_address_id: pick("pointId"),
  })
}

/** Lists the fields Apaczka needs that are empty, for clear error messages. */
export function missingAddressFields(address: ApaczkaAddress): string[] {
  const required: Array<keyof ApaczkaAddress> = ["name", "line1", "postal_code", "city", "country_code"]
  return required.filter((key) => !address[key])
}

export function assertCompleteAddress(address: ApaczkaAddress, role: "sender" | "receiver"): void {
  const missing = missingAddressFields(address)
  if (missing.length) {
    const hint =
      role === "sender"
        ? " Fill in the stock location address, or set `sender` / `senderByLocation` in the plugin options."
        : ""
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Apaczka ${role} address is missing: ${missing.join(", ")}.${hint}`
    )
  }
}

/** Polish postal codes are `00-000`; customers often type `00000`. */
export function formatPostalCode(postalCode: string | null | undefined, countryCode?: string | null): string {
  const value = (postalCode ?? "").trim()
  if ((countryCode ?? "pl").toLowerCase() === "pl" && /^\d{5}$/.test(value)) {
    return `${value.slice(0, 2)}-${value.slice(2)}`
  }
  return value
}

/** Strips spaces, dashes and brackets; keeps a leading `+`. */
export function normalizePhone(phone: string | null | undefined): string | undefined {
  if (!phone) {
    return undefined
  }
  const cleaned = phone.trim().replace(/[\s\-().]/g, "")
  return cleaned.length ? cleaned : undefined
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}
