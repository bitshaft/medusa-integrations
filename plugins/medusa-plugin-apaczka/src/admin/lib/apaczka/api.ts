import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { backendUrl, sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

export type ShipmentStatus =
  | "pending"
  | "created"
  | "posted"
  | "in_transit"
  | "out_for_delivery"
  | "ready_for_pickup"
  | "delivered"
  | "exception"
  | "returned"
  | "canceled"
  | "claimed"
  | "unknown"

export type TrackingEvent = {
  id: string
  source: "webhook" | "polling" | "system"
  status: ShipmentStatus
  raw_status: string
  description: string | null
  place: string | null
  occurred_at: string
}

export type Shipment = {
  id: string
  fulfillment_id: string
  order_id: string | null
  apaczka_order_id: string | null
  waybill_number: string | null
  tracking_url: string | null
  service_id: number
  service_name: string | null
  supplier: string | null
  status: ShipmentStatus
  raw_status: string | null
  is_return: boolean
  is_cod: boolean
  point_id: string | null
  label_format: "pdf" | "zpl"
  price_net: number | null
  price_gross: number | null
  cod_amount: number | null
  declared_value: number | null
  pickup_type: string | null
  pickup_date: string | null
  pickup_number: string | null
  last_synced_at: string | null
  error: string | null
  metadata: { sender_postal_code?: string } | null
  created_at: string
  events: TrackingEvent[]
  /** The order's number, for links; only on the shipments list. */
  order_display_id?: number | null
}

export type ShipmentsFilter = {
  q?: string
  status?: string
  is_return?: "true" | "false"
  limit: number
  offset: number
}

export type ServiceOption = {
  id: string
  name: string
  service_id: number
  service_name: string
  supplier: string
  cod: boolean
  is_return: boolean
  origin: "door" | "point"
  destination: "door" | "point"
  domestic: boolean
  pickup_courier: 0 | 1 | 2
  points_type?: string
}

export type ParcelInput = {
  weight: number
  length: number
  width: number
  height: number
  package_type?: string
  non_standard?: boolean
}

export type ShipmentOverrides = {
  service_id?: number
  parcels?: ParcelInput[]
  pickup?: { type: "SELF" } | { type: "COURIER"; date: string; hours_from: string; hours_to: string }
  cod_amount?: number
  declared_value?: number
  point_id?: string
  options?: Record<string, number | string | boolean>
  content?: string
  comment?: string
}

export type Valuation = {
  service_id: number
  price_net: number
  price_gross: number
  currency_code: string
  defaults: {
    parcels: ParcelInput[]
    cod_amount: number
    declared_value: number
    point_id: string | null
  }
  sender_postal_code: string
  option: ServiceOption
  /** Items counted with the default weight because their variant has none. */
  missing_weight: Array<{ title: string; quantity: number; variant_id: string | null; product_id: string | null }>
  default_item_weight_kg: number
}

export type ApaczkaSettingsResponse = {
  settings: { hold_without_weight: boolean }
  parcel: {
    default_item_weight_kg: number
    weight_unit: "g" | "kg"
    packaging_weight_kg: number
    min_weight_kg: number
    strategy: "single" | "per_item"
  }
  shipment_creation: "auto" | "manual"
}

export type VariantWithoutWeight = {
  id: string
  title: string | null
  sku: string | null
  product_id: string | null
  product_title: string | null
}

/** Returned when options are missing or invalid; the plugin is then inactive. */
export type ApaczkaDisabledStatus = {
  enabled: false
  disabled_reason: string
  version: string
}

export type ApaczkaStatus = ApaczkaDisabledStatus | ApaczkaEnabledStatus

export type ApaczkaEnabledStatus = {
  enabled: true
  version: string
  environment: "production" | "sandbox" | "custom" | "demo"
  demo: boolean
  /** Demo mode whose parcel points come from the account (`livePoints`). */
  live_points: boolean
  base_url: string
  app_id: string
  connection: { ok: boolean; services?: number; error?: string; authentication_error?: boolean }
  settings: {
    shipment_creation: "auto" | "manual"
    label_format: "pdf" | "zpl"
    pickup_type: "SELF" | "COURIER"
    pricing_basis: "gross" | "net"
    insurance: "none" | "order_total" | "fixed"
    cod_account_configured: boolean
    sender_defaults: string[]
    sender_locations: string[]
  }
  tracking: { webhook_url: string | null; polling: boolean; mark_shipped: boolean; mark_delivered: boolean }
}

export type PickupDay = { date: string; services: unknown }

/* Query keys ---------------------------------------------------------------- */

export const apaczkaKeys = {
  all: ["apaczka"] as const,
  allShipments: ["apaczka", "shipments"] as const,
  shipments: (orderId: string) => ["apaczka", "shipments", orderId] as const,
  shipmentList: (filter: ShipmentsFilter) => ["apaczka", "shipments", "list", filter] as const,
  status: ["apaczka", "status"] as const,
  services: ["apaczka", "services"] as const,
  pickupHours: (postalCode: string, serviceId: number) => ["apaczka", "pickup-hours", postalCode, serviceId] as const,
  settings: ["apaczka", "settings"] as const,
  withoutWeight: (offset: number) => ["apaczka", "without-weight", offset] as const,
  points: ["apaczka", "points"] as const,
}

/** One stored parcel point list (`GET /admin/apaczka/points`). */
export type PointList = {
  type: string
  country_code: string
  source: string | null
  status: "idle" | "running" | "failed"
  started_at: string | null
  finished_at: string | null
  succeeded_at: string | null
  point_count: number | null
  error: string | null
}

export function useApaczkaPoints(enabled = true) {
  return useQuery({
    queryKey: apaczkaKeys.points,
    queryFn: () => sdk.client.fetch<{ lists: PointList[]; types: string[] }>("/admin/apaczka/points"),
    enabled,
  })
}

export function useSyncPoints() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { type: string; country_code?: string }) =>
      sdk.client.fetch<{ list: PointList | null }>("/admin/apaczka/points/sync", { method: "POST", body: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: apaczkaKeys.points }),
  })
}

export function useApaczkaSettings(enabled = true) {
  return useQuery({
    queryKey: apaczkaKeys.settings,
    queryFn: () => sdk.client.fetch<ApaczkaSettingsResponse>("/admin/apaczka/settings"),
    enabled,
  })
}

export function useSaveApaczkaSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: ApaczkaSettingsResponse["settings"]) =>
      sdk.client.fetch<ApaczkaSettingsResponse>("/admin/apaczka/settings", { method: "POST", body: settings }),
    onSuccess: (data) => queryClient.setQueryData(apaczkaKeys.settings, data),
  })
}

export function useVariantsWithoutWeight(offset: number, enabled = true) {
  return useQuery({
    queryKey: apaczkaKeys.withoutWeight(offset),
    queryFn: () =>
      sdk.client.fetch<{ variants: VariantWithoutWeight[]; count: number; limit: number; offset: number }>(
        "/admin/apaczka/variants-without-weight",
        { query: { limit: 10, offset } }
      ),
    enabled,
  })
}

/* Hooks --------------------------------------------------------------------- */

export function useOrderShipments(orderId: string) {
  return useQuery({
    queryKey: apaczkaKeys.shipments(orderId),
    queryFn: () =>
      sdk.client.fetch<{ shipments: Shipment[]; count: number }>("/admin/apaczka/shipments", {
        query: { order_id: orderId, limit: 50 },
      }),
  })
}

/** Every shipment in the store, newest first, for the Apaczka page. */
export function useShipments(filter: ShipmentsFilter) {
  return useQuery({
    queryKey: apaczkaKeys.shipmentList(filter),
    queryFn: () =>
      sdk.client.fetch<{ shipments: Shipment[]; count: number; limit: number; offset: number }>(
        "/admin/apaczka/shipments",
        { query: Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined && value !== "")) }
      ),
    placeholderData: (previous) => previous,
  })
}

/**
 * Downloads the hand-over (turn-in) confirmation PDF for the given
 * shipments; the courier signs it at pickup.
 */
export async function downloadTurnIn(shipmentIds: string[]): Promise<void> {
  const response = await fetch(backendUrl("/admin/apaczka/turn-in"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shipment_ids: shipmentIds }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? response.statusText)
  }
  const blob = await response.blob()
  const name = /filename="?([^";]+)"?/.exec(response.headers.get("content-disposition") ?? "")?.[1]
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name ?? "apaczka-turn-in.pdf"
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function useApaczkaStatus(refresh = false) {
  return useQuery({
    queryKey: [...apaczkaKeys.status, refresh],
    queryFn: () =>
      sdk.client.fetch<ApaczkaStatus>("/admin/apaczka/status", { query: refresh ? { refresh: "true" } : {} }),
  })
}

export function useApaczkaServices(enabled = true) {
  return useQuery({
    queryKey: apaczkaKeys.services,
    enabled,
    queryFn: () =>
      sdk.client.fetch<{
        services: ServiceOption[]
        options: Array<{ id: string; type: string; name?: string; desc?: string }>
        package_types: Array<{ id: string; type: string; desc?: string }>
        points_types: string[]
      }>("/admin/apaczka/services"),
    staleTime: 5 * 60_000,
  })
}

export function usePickupHours(postalCode: string | undefined, serviceId: number | undefined) {
  return useQuery({
    queryKey: apaczkaKeys.pickupHours(postalCode ?? "", serviceId ?? 0),
    enabled: Boolean(postalCode && serviceId),
    queryFn: () =>
      sdk.client.fetch<{ postal_code: string; days: PickupDay[] }>("/admin/apaczka/pickup-hours", {
        query: { postal_code: postalCode, service_id: serviceId },
      }),
  })
}

export function useValuation(fulfillmentId: string) {
  return useMutation({
    mutationFn: (overrides: ShipmentOverrides | undefined) =>
      sdk.client.fetch<Valuation>(`/admin/apaczka/fulfillments/${fulfillmentId}/valuation`, {
        method: "POST",
        body: { overrides },
      }),
  })
}

export function useCreateShipment(fulfillmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (overrides: ShipmentOverrides | undefined) =>
      sdk.client.fetch<{ shipment: Shipment }>(`/admin/apaczka/fulfillments/${fulfillmentId}/shipment`, {
        method: "POST",
        body: { overrides },
      }),
    onSuccess: () => invalidateShipments(queryClient),
  })
}

export function useSyncShipment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (shipmentId: string) =>
      sdk.client.fetch<{ shipment: Shipment }>(`/admin/apaczka/shipments/${shipmentId}/sync`, { method: "POST" }),
    onSuccess: () => invalidateShipments(queryClient),
  })
}

export function useBookPickup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { shipment_ids: string[]; date: string; hour_from: string; hour_to: string }) =>
      sdk.client.fetch<{ shipments: Shipment[]; pickup_number: string | null }>("/admin/apaczka/pickups", {
        method: "POST",
        body,
      }),
    onSuccess: () => invalidateShipments(queryClient),
  })
}

export async function fetchDispatchCode(apaczkaOrderId: string) {
  return sdk.client.fetch<{ order_id: string; dispatch_code: string | null }>(
    `/admin/apaczka/orders/${apaczkaOrderId}/documents/dispatch_code`
  )
}

function invalidateShipments(queryClient: ReturnType<typeof useQueryClient>) {
  // The order's shipments and every shipments list on the Apaczka page.
  queryClient.invalidateQueries({ queryKey: apaczkaKeys.allShipments })
  // Refresh Medusa's own order view (fulfillment status, labels).
  queryClient.invalidateQueries({ queryKey: ["orders"] })
}
