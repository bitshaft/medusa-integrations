/**
 * Types for the Apaczka API v2 (https://api-docs.apaczka.pl).
 *
 * Field names mirror the wire format exactly — the API silently ignores
 * unknown keys, so a renamed field means lost data, not an error.
 *
 * Money is always an integer amount in grosze (1 PLN = 100 gr).
 */

/* ------------------------------------------------------------------------ */
/* Shared                                                                    */
/* ------------------------------------------------------------------------ */

export type ApaczkaEnvironment = "production" | "sandbox"

export type ApaczkaEnvelope<T> = {
  status: number
  message: string
  response: T | null
}

/** `0` unavailable · `1` available · `2` required (for `pickup_courier`). */
export type ApaczkaFlag = 0 | 1 | 2

export type ApaczkaAddress = {
  name: string
  line1: string
  line2?: string
  postal_code: string
  city: string
  /** ISO 3166-1 alpha-2. */
  country_code: string
  /** Region/state — required by some countries (e.g. US). */
  state_code?: string
  contact_person?: string
  email?: string
  phone?: string
  is_residential?: boolean
  /** Parcel point ID (locker, PUDO) from `points/{type}/`. */
  foreign_address_id?: string
  foreign_address_subtype?: string
}

/* ------------------------------------------------------------------------ */
/* Orders                                                                    */
/* ------------------------------------------------------------------------ */

export type ApaczkaPickupType = "SELF" | "COURIER"

export type ApaczkaOrderPickup =
  | { type: "SELF" }
  | {
      type: "COURIER"
      /** `YYYY-MM-DD` */
      date: string
      /** `HH:MM` — note the plural field names at order creation. */
      hours_from: string
      hours_to: string
    }

export type ApaczkaCustomsItem = {
  description: string
  quantity: number
  /** Grosze. */
  unit_price: number
  /** Kilograms. */
  weight: number
  hs_code?: string
  country_of_origin?: string
}

export type ApaczkaParcel = {
  /** Package type from `service_structure.package_type`, e.g. `PACZKA`. */
  shipment_type_code?: string
  /** Length in cm (integer). */
  dimension1: number
  /** Width in cm (integer). */
  dimension2: number
  /** Height in cm (integer). */
  dimension3: number
  /** Kilograms. */
  weight: number
  /** Non-standard parcel flag. */
  is_nstd?: 0 | 1
  content?: string
  comment?: string
  customs_data?: ApaczkaCustomsItem[]
}

export type ApaczkaCod = {
  /** Grosze. */
  amount: number
  currency?: string
  /** IBAN for the payout. Either this or `bankaccount_id`. */
  bankaccount?: string
  /** ID of a bank account saved in the Apaczka panel. */
  bankaccount_id?: number
}

export type ApaczkaNotificationChannels = {
  isReceiverEmail: boolean
  isReceiverSms: boolean
  isSenderEmail: boolean
  isSenderSms: boolean
}

export type ApaczkaNotificationSettings = Partial<
  Record<"new" | "sent" | "exception" | "delivered", ApaczkaNotificationChannels>
>

export type ApaczkaOrderInput = {
  /** Omit to price across every service that can carry the parcel. */
  service_id?: number
  address: {
    sender: ApaczkaAddress
    receiver: ApaczkaAddress
  }
  pickup?: ApaczkaOrderPickup
  shipment: ApaczkaParcel[]
  /** Additional services keyed by option ID from `service_structure.options`. */
  option?: Record<string, number | string | boolean>
  notification?: ApaczkaNotificationSettings
  cod?: ApaczkaCod
  /** Declared value (insurance) in grosze. */
  shipment_value?: number
  content?: string
  comment?: string
  /** `true` returns labels in ZPL for thermal printers instead of PDF. */
  is_zebra?: boolean
  /** Per-order push-tracking webhook URL. */
  push_tracking_url?: string
}

export type ApaczkaOrderPayload = { order: ApaczkaOrderInput }

export type ApaczkaOrderAddress = Omit<ApaczkaAddress, "is_residential"> & {
  foreign_address_id?: string | null
}

export type ApaczkaOrderSummary = {
  id: number
  service_id: number
  service_name: string
  waybill_number: string | null
  pickup_number: string | null
  tracking_url: string | null
  status: string
  shipments_count: number
  content?: string
  comment?: string
  receiver?: ApaczkaOrderAddress
  created?: string
  delivered?: string | null
  supplier?: string
  externalId?: string | boolean
}

export type ApaczkaOrderShipment = {
  shipment_type_code: string
  weight: number
  weight_billable?: number
  length: number
  width: number
  height: number
  content?: string
  comment?: string
  waybill_number: string | null
  is_nstd: 0 | 1
  /** Decimal string in PLN, e.g. `"9.92"`. */
  price?: string
  price_vat?: string
  price_gross?: string
}

export type ApaczkaOrderDetails = ApaczkaOrderSummary & {
  pickup?: ApaczkaOrderPickup
  shipments?: ApaczkaOrderShipment[]
  sender?: ApaczkaOrderAddress
  /** Decimal strings in PLN. */
  price?: string
  price_var?: string
  price_gross?: string
  cod?: false | Record<string, unknown>
  cod_currency?: string | null
  declaration_value?: false | number | string
}

export type ApaczkaValuationEntry = {
  /** Net price in grosze. */
  price: number
  /** Gross price in grosze. */
  price_gross: number
  options?: unknown[]
  shipments?: unknown[]
}

export type ApaczkaValuation = {
  /** Keyed by `service_id`. */
  price_table: Record<string, ApaczkaValuationEntry>
}

export type ApaczkaOrdersListPayload = { page?: number; limit?: number }

/* ------------------------------------------------------------------------ */
/* Dictionary                                                                */
/* ------------------------------------------------------------------------ */

export type ApaczkaService = {
  service_id: number | string
  name: string
  supplier: string
  /** `1` domestic, `0` international. */
  domestic?: number | string
  pickup_courier?: number | string
  door_to_door?: number | string
  door_to_point?: number | string
  point_to_point?: number | string
  point_to_door?: number | string
  [key: string]: unknown
}

export type ApaczkaDictionaryEntry = {
  type: string
  name?: string
  desc?: string
}

export type ApaczkaServiceStructure = {
  services: Record<string, ApaczkaService> | ApaczkaService[]
  options?: Record<string, ApaczkaDictionaryEntry>
  package_type?: Record<string, ApaczkaDictionaryEntry>
  points_type?: string[] | Record<string, string>
  pickup_type?: Record<string, ApaczkaDictionaryEntry>
  unit_type?: Record<string, ApaczkaDictionaryEntry>
}

export type ApaczkaPointsPayload = {
  country_code?: string
  subtype?: string
}

export type ApaczkaPoint = {
  type: string
  subtype: string
  name: string
  foreign_address_id: string
  address: {
    line1: string
    line2?: string
    street?: string
    house_number?: string
    flat_number?: string
    postal_code: string
    city: string
    state_code?: string
    country_code: string
    /** Decimal string. */
    longitude: string
    latitude: string
  }
  image_url?: string
  open_hours?: string | Record<string, unknown>
  option_cod?: boolean
  option_send?: boolean
  option_deliver?: boolean
  additional_info?: string
  distance?: number
}

export type ApaczkaPointsResponse = {
  points: Record<string, ApaczkaPoint> | ApaczkaPoint[]
}

/* ------------------------------------------------------------------------ */
/* Documents                                                                 */
/* ------------------------------------------------------------------------ */

export type ApaczkaWaybill = {
  /** Base64-encoded document. */
  waybill: string
  /** e.g. `pdf` or `zpl`. */
  type: string
}

export type ApaczkaDispatchCode = {
  order_id: number
  dispatch_code: string | null
}

export type ApaczkaTurnIn = {
  /** Base64-encoded PDF. */
  turn_in: string
}

/* ------------------------------------------------------------------------ */
/* Pickups                                                                   */
/* ------------------------------------------------------------------------ */

export type ApaczkaPickupHoursPayload = {
  postal_code: string
  service_id: number
  remove_index?: boolean
}

export type ApaczkaPickupHoursDay = {
  /** `YYYY-MM-DD` */
  date: string
  services: Record<string, unknown> | unknown[]
}

export type ApaczkaPickupHours = {
  postal_code: string
  hours: Record<string, ApaczkaPickupHoursDay> | ApaczkaPickupHoursDay[]
}

/** Singular `hour_from` / `hour_to` here — unlike order creation. */
export type ApaczkaPickupPayload = {
  date: string
  hour_from: string
  hour_to: string
}

export type ApaczkaBatchPickupPayload = ApaczkaPickupPayload & {
  order_ids: number[]
}

export type ApaczkaPickupResult = {
  foreign_courier_id?: string
  [key: string]: unknown
}

/* ------------------------------------------------------------------------ */
/* Tracking                                                                  */
/* ------------------------------------------------------------------------ */

/** Normalized statuses returned by the `tracking/` endpoint (polling). */
export type ApaczkaPollingStatus =
  | "NEW"
  | "PICKUP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "DELIVERED_NO_SYSTEM"
  | "EXCEPTION"
  | "RETURNED_TO_SHIPPER"
  | "CANCELLED"
  | "CORRECTION"
  | "UNKNOWN"

export type ApaczkaTrackingEvent = {
  status: ApaczkaPollingStatus | string
  status_original?: string
  description?: string
  place?: string
  /** ISO 8601 (UTC). */
  updated_at: string
}

export type ApaczkaTracking = {
  /** Newest first. */
  data: ApaczkaTrackingEvent[]
  service?: string
}

/** Normalized statuses sent by push-tracking webhooks. */
export type ApaczkaWebhookStatus =
  | "NEW"
  | "READY_TO_SEND"
  | "ADVISING"
  | "POSTED"
  | "ON_THE_WAY"
  | "OUT_FOR_DELIVERY"
  | "READY_TO_PICKUP"
  | "DELIVERED"
  | "WAITING_FOR_PAYOUT"
  | "SENT"
  | "AVIZO"
  | "REMINDER_SENT"
  | "OTHER"
  | "UNKNOWN"
  | "PICKUP_EXPIRED"
  | "RETURNED"
  | "CANCELED"
  | "CLAIMED"

export type PushTrackingOperatorStatus = {
  status: string
  description?: string
  place?: string
  updatedAt: string
}

export type PushTrackingStatus = {
  status: ApaczkaWebhookStatus | string
  /** `Y-m-d\TH:i:s`, no time zone. */
  updatedAt: string
  trackingOperatorStatuses?: PushTrackingOperatorStatus[]
}

export type PushTrackingNotification = {
  /** The Apaczka order ID (not the waybill number). */
  orderNumber: string | number
  statuses: PushTrackingStatus[]
}
