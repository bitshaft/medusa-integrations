import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

export type SubscriptionStatus = "pending" | "active" | "purchased" | "unsubscribed" | "expired"
export type NotificationStatus = "pending" | "sent" | "demo" | "skipped" | "failed"
export type Sending = "emails" | "notification" | "demo"

export type ProductLabel = {
  product_id: string | null
  product_title: string
  variant_title: string | null
  label: string
  sku: string | null
  thumbnail: string | null
}

export type BackInStockStatus =
  | { enabled: false; disabled_reason: string; version: string }
  | {
      enabled: true
      version: string
      demo: boolean
      sending: { restock: Sending; confirm: Sending; emails_option: "auto" | "off"; channel: string }
      links: {
        backend_url: string | null
        storefront_url: string | null
        product: string
        confirm: string | null
        unsubscribe: string | null
      }
      counts: { active: number; pending: number; ended: number; demo: number; pending_checks: number }
    }

export type Settings = {
  minQuantity: number
  delayMinutes: number
  minGapHours: number
  maxNotifications: number
  doubleOptIn: boolean
  retention: { unconfirmedDays: number; endedDays: number; activeDays: number }
  consentText: { en?: string; pl?: string }
}

export type SettingsResponse = {
  settings: Settings
  consent: { en: string; pl: string }
  overridden: string[]
  defaults: Settings
}

export type WantedVariant = ProductLabel & {
  variant_id: string
  sales_channel_id: string
  sales_channel_name: string
  waiting: number
  pending: number
  notified: number
  in_stock: boolean
  available: number | null
  reason: string | null
  problem: "no_inventory_item" | "missing" | null
}

export type Subscription = {
  id: string
  email: string | null
  variant_id: string
  product_id: string | null
  sales_channel_id: string
  sales_channel_name: string
  customer_id: string | null
  locale: string
  status: SubscriptionStatus
  notification_count: number
  last_notified_at: string | null
  confirmed_at: string | null
  ended_at: string | null
  anonymized: boolean
  demo: boolean
  created_at: string
  product: ProductLabel
}

export type Notification = {
  id: string
  subscription_id: string
  variant_id: string
  sales_channel_id: string
  sales_channel_name: string
  kind: "restock" | "confirm"
  status: NotificationStatus
  via: string | null
  available: number | null
  error: string | null
  sent_at: string | null
  created_at: string
  email: string | null
  demo: boolean
  product: ProductLabel
}

export type ProductVariantWaiting = {
  id: string
  title: string | null
  sku: string | null
  waiting: number
  pending: number
  last_notified_at: string | null
  problem: "no_inventory_item" | null
}

type Page<K extends string, T> = { [key in K]: T[] } & { count: number; limit: number; offset: number }

/* Queries ----------------------------------------------------------------- */

const KEY = "back-in-stock"
const BASE = "/admin/back-in-stock"

export function useBackInStockStatus() {
  return useQuery({ queryKey: [KEY, "status"], queryFn: () => sdk.client.fetch<BackInStockStatus>(`${BASE}/status`) })
}

export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "settings"],
    queryFn: () => sdk.client.fetch<SettingsResponse>(`${BASE}/settings`),
    enabled,
  })
}

export function useWanted(params: { limit: number; offset: number; demo?: boolean }, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "wanted", params],
    queryFn: () =>
      sdk.client.fetch<Page<"variants", WantedVariant>>(`${BASE}/wanted`, {
        query: { ...params, demo: params.demo === undefined ? undefined : String(params.demo) },
      }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useSubscriptions(
  params: {
    limit: number
    offset: number
    status?: SubscriptionStatus
    q?: string
    variant_id?: string
    demo?: boolean
  },
  enabled: boolean
) {
  return useQuery({
    queryKey: [KEY, "subscriptions", params],
    queryFn: () =>
      sdk.client.fetch<Page<"subscriptions", Subscription>>(`${BASE}/subscriptions`, {
        query: {
          ...params,
          q: params.q || undefined,
          demo: params.demo === undefined ? undefined : String(params.demo),
        },
      }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useNotifications(
  params: { limit: number; offset: number; status?: NotificationStatus; subscription_id?: string },
  enabled: boolean
) {
  return useQuery({
    queryKey: [KEY, "notifications", params],
    queryFn: () => sdk.client.fetch<Page<"notifications", Notification>>(`${BASE}/notifications`, { query: params }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useProductWaiting(productId: string, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "product", productId],
    queryFn: () => sdk.client.fetch<{ variants: ProductVariantWaiting[] }>(`${BASE}/products/${productId}`),
    enabled,
  })
}

/* Mutations --------------------------------------------------------------- */

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [KEY] })
}

export function useSaveSettings() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: Partial<Settings> | { reset: true }) =>
      sdk.client.fetch<SettingsResponse>(`${BASE}/settings`, { method: "POST", body }),
    onSuccess: invalidate,
  })
}

export function useEndSubscription() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`${BASE}/subscriptions/${id}/end`, { method: "POST", body: { status: "unsubscribed" } }),
    onSuccess: invalidate,
  })
}

export function useSeedDemo() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { emails: string[]; count: number; locale?: "en" | "pl" }) =>
      sdk.client.fetch<{ created: number; variants: string[]; sales_channel_id: string }>(`${BASE}/demo`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  })
}

export function useSimulateRestock() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { variant_id: string; sales_channel_id: string }) =>
      sdk.client.fetch<{ outcome: { status: string; notified?: number; failed?: number } }>(`${BASE}/demo/restock`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteDemo() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ deleted: number }>(`${BASE}/demo/delete`, { method: "POST", body: { confirm: "DELETE" } }),
    onSuccess: invalidate,
  })
}
