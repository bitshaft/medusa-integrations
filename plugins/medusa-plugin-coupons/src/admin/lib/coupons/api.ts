import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { backendUrl, sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

export type CouponKind = "percentage" | "fixed" | "free_shipping" | "category" | "buy_get"
export type Audience = "all" | "groups" | "customers"
export type CouponStatus = "active" | "scheduled" | "paused" | "ended"
export type CouponFilter = "all" | "active" | "scheduled" | "paused" | "ended" | "expiring" | "automatic"
export type Tier = { min: number; value: number }

export type CouponDraft = {
  kind: CouponKind
  value: number | null
  currency_code: string | null
  category_ids: string[]
  buy_qty: number | null
  get_qty: number | null
  buy_product_ids: string[]
  tiers: Tier[] | null
  code: string | null
  automatic: boolean
  starts_at: string | null
  ends_at: string | null
  usage_limit: number | null
  per_customer_limit: number | null
  audience: Audience
  audience_ids: string[]
  first_order_only: boolean
  exclusive: boolean
  min_subtotal: number | null
  exclusions: { product_ids: string[]; collection_ids: string[]; category_ids: string[]; skip_discounted: boolean }
}

export type CouponView = {
  id: string
  code: string
  name: string | null
  kind: CouponKind
  automatic: boolean
  exclusive: boolean
  tiered: boolean
  batch_size: number | null
  status: CouponStatus
  expiring: boolean
  created_at: string
  starts_at: string | null
  ends_at: string | null
  used: number
  limit: number | null
  per_customer_limit: number | null
  sentence: { pl: string; en: string }
  stats: { orders: number; discount: number; revenue: number }
  promotion_ids: string[]
  codes: string[]
  draft: CouponDraft
}

export type Cards = {
  total: number
  active: number
  scheduled: number
  expiring: number
  automatic: number
  orders_30d: number
  discount_30d: number
  currency_code: string
}

export type CouponsResponse = { coupons: CouponView[]; counts: Record<CouponFilter, number>; cards: Cards }

export type DraftError = string
export type DraftWarning =
  "overlaps_active_coupon" | "full_discount" | "discount_above_minimum" | "no_conditions_automatic"
export type PreviewResponse = { errors: DraftError[]; warnings: DraftWarning[]; sentence: { pl: string; en: string } }

export type CouponOrder = {
  id: string
  display_id: number | null
  created_at: string
  email: string | null
  total: number
  currency_code: string
  discount: number
  codes: string[]
}

export type BatchCode = {
  code: string
  used: boolean
  status: string
  order_id: string | null
  order_display_id: number | null
  used_at: string | null
}

export type Settings = { currencyCode: string; codeLength: number; exportLocale: "pl" | "en" }
export type SettingsResponse =
  | { enabled: false; disabled_reason: string; version: string }
  | {
      enabled: true
      version: string
      options: {
        timeZone: string
        defaultLocale: "pl" | "en"
        maxBatchSize: number
        checkRateLimitPerMinute: number
        demo: boolean
      }
      settings: Settings
      defaults: Settings
    }

/* Queries ----------------------------------------------------------------- */

const KEY = "coupons"

export function useSettings() {
  return useQuery({
    queryKey: [KEY, "settings"],
    queryFn: () => sdk.client.fetch<SettingsResponse>("/admin/coupons/settings"),
  })
}

export function useCoupons(params: { filter: CouponFilter; q: string }, enabled = true) {
  return useQuery({
    queryKey: [KEY, "list", params],
    queryFn: () =>
      sdk.client.fetch<CouponsResponse>("/admin/coupons", {
        query: { filter: params.filter, ...(params.q ? { q: params.q } : {}) },
      }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useCoupon(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, "detail", id],
    queryFn: () => sdk.client.fetch<{ coupon: CouponView }>(`/admin/coupons/${id}`),
    enabled: !!id,
  })
}

export function useCouponOrders(id: string | null) {
  return useQuery({
    queryKey: [KEY, "orders", id],
    queryFn: () => sdk.client.fetch<{ orders: CouponOrder[] }>(`/admin/coupons/${id}/orders`),
    enabled: !!id,
  })
}

export function useBatchCodes(id: string | null) {
  return useQuery({
    queryKey: [KEY, "codes", id],
    queryFn: () => sdk.client.fetch<{ codes: BatchCode[] }>(`/admin/coupons/${id}/codes`),
    enabled: !!id,
  })
}

export function usePreview(draft: CouponDraft, id?: string) {
  return useQuery({
    queryKey: [KEY, "preview", draft, id],
    queryFn: () =>
      sdk.client.fetch<PreviewResponse>("/admin/coupons/preview", {
        method: "POST",
        body: { draft, ...(id ? { id } : {}) },
      }),
    placeholderData: keepPreviousData,
  })
}

export function suggestCode(kind: CouponKind, value: number | null) {
  return sdk.client.fetch<{ code: string }>("/admin/coupons/suggest", {
    query: { kind, ...(value != null ? { value: String(value) } : {}) },
  })
}

/* Mutations --------------------------------------------------------------- */

function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [KEY] })
}

export function useSaveCoupon(id?: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { draft: CouponDraft; name: string | null }) =>
      sdk.client.fetch<{ id?: string; coupon?: CouponView }>(id ? `/admin/coupons/${id}` : "/admin/coupons", {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  })
}

export function useCreateBatch() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { draft: CouponDraft; prefix: string; quantity: number; name: string | null }) =>
      sdk.client.fetch<{ id: string; quantity: number }>("/admin/coupons/batches", { method: "POST", body }),
    onSuccess: invalidate,
  })
}

export function useSetStatus() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) =>
      sdk.client.fetch(`/admin/coupons/${id}/status`, { method: "POST", body: { status } }),
    onSuccess: invalidate,
  })
}

export function useDuplicate() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => sdk.client.fetch<{ id: string }>(`/admin/coupons/${id}/duplicate`, { method: "POST" }),
    onSuccess: invalidate,
  })
}

export function useDeleteCoupon() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/coupons/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
}

export function useSaveSettings() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: Partial<Settings>) =>
      sdk.client.fetch<{ settings: Settings }>("/admin/coupons/settings", { method: "POST", body }),
    onSuccess: invalidate,
  })
}

/** Downloads come from the backend directly, with the admin's session cookie. */
export const exportUrl = (locale: "pl" | "en") => backendUrl(`/admin/coupons/export?locale=${locale}`)
export const batchCsvUrl = (id: string, locale: "pl" | "en") =>
  backendUrl(`/admin/coupons/${id}/codes?format=csv&locale=${locale}`)

/* Pickers: Medusa's own admin API ----------------------------------------- */

export type Option = { value: string; label: string }
export type OptionKind = "groups" | "categories" | "collections" | "products" | "customers"

/** Records of one kind as picker options, by search text or by ids. */
async function fetchOptions(kind: OptionKind, query: { q?: string; id?: string[]; limit: number }): Promise<Option[]> {
  switch (kind) {
    case "groups":
      return (await sdk.admin.customerGroup.list(query)).customer_groups.map((g) => ({
        value: g.id,
        label: g.name ?? g.id,
      }))
    case "categories":
      return (await sdk.admin.productCategory.list(query)).product_categories.map((c) => ({
        value: c.id,
        label: c.name,
      }))
    case "collections":
      return (await sdk.admin.productCollection.list(query)).collections.map((c) => ({ value: c.id, label: c.title }))
    case "products":
      return (await sdk.admin.product.list({ ...query, fields: "id,title" })).products.map((p) => ({
        value: p.id,
        label: p.title,
      }))
    case "customers":
      return (await sdk.admin.customer.list({ ...query, fields: "id,email,first_name,last_name" })).customers.map(
        (c) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ")
          return { value: c.id, label: name ? `${name} (${c.email})` : c.email }
        }
      )
  }
}

export function useOptions(kind: OptionKind, q: string, enabled = true) {
  return useQuery({
    queryKey: [KEY, "options", kind, q],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => fetchOptions(kind, { q: q || undefined, limit: 50 }),
  })
}

/** Labels for ids already chosen, so a saved coupon shows names, not ids. */
export function useLabels(kind: OptionKind, ids: string[]) {
  return useQuery({
    queryKey: [KEY, "labels", kind, ids],
    enabled: ids.length > 0,
    queryFn: async () =>
      Object.fromEntries((await fetchOptions(kind, { id: ids, limit: ids.length })).map((o) => [o.value, o.label])),
  })
}

/** "Restore test data" (demo mode only): recreates the "[Demo]" coupons. */
export function useResetCouponsDemo() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ removed: number; coupons: number; codes: number }>("/admin/coupons/demo/reset", {
        method: "POST",
      }),
    onSuccess: invalidate,
  })
}
