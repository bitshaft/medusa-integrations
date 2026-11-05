import type { StockLocationLike } from "./addresses"
import type { ShipmentStatus } from "./apaczka"

/**
 * What the storefront sends as shipping method `data` for point delivery:
 *
 * ```ts
 * sdk.store.cart.addShippingMethod(cartId, { option_id, data: { point_id: "WAW01M" } })
 * ```
 */
export type ApaczkaShippingMethodInput = {
  point_id?: string
}

/** Snapshot of the chosen point, stored on the shipping method for display. */
export type ApaczkaPointSnapshot = {
  id: string
  type: string
  name: string
  line1: string
  postal_code: string
  city: string
  country_code: string
}

/** The validated shipping method `data` (output of `validateFulfillmentData`). */
export type ApaczkaShippingMethodData = {
  point_id?: string
  point?: ApaczkaPointSnapshot
  /** Stock location the price was quoted from. */
  location_id?: string
  /** Snapshot of that location, used as the sender address. */
  location?: StockLocationLike & { id: string }
}

/** Our part of `fulfillment.data`, under the `apaczka` key. */
export type ApaczkaFulfillmentState = {
  /** `pending` until the Apaczka order exists (manual mode, or deferred returns). */
  state: "pending" | "created" | "canceled"
  status?: ShipmentStatus
  order_id?: number
  waybill_number?: string | null
  tracking_url?: string | null
  service_id: number
  service_name?: string
  supplier?: string
  is_return: boolean
  cod: boolean
  point_id?: string
  label_format: "pdf" | "zpl"
  /** Grosze. */
  price_net?: number
  price_gross?: number
  cod_amount?: number
  declared_value?: number
  created_at?: string
  error?: string
}

export type ApaczkaFulfillmentData = ApaczkaShippingMethodData & {
  apaczka?: ApaczkaFulfillmentState
}

/** Overrides staff can set when creating a shipment by hand. */
export type ShipmentOverrides = {
  service_id?: number
  parcels?: Array<{
    weight: number
    length: number
    width: number
    height: number
    package_type?: string
    non_standard?: boolean
  }>
  pickup?:
    | { type: "SELF" }
    | { type: "COURIER"; date: string; hours_from: string; hours_to: string }
  /** COD amount in major units; `0` disables COD. */
  cod_amount?: number
  /** Declared value in PLN; `0` disables insurance. */
  declared_value?: number
  point_id?: string
  options?: Record<string, number | string | boolean>
  content?: string
  comment?: string
}

export function readFulfillmentData(data: unknown): ApaczkaFulfillmentData {
  return data && typeof data === "object" ? (data as ApaczkaFulfillmentData) : {}
}
