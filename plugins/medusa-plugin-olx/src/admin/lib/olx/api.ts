import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

export type AdvertAttribute = { code: string; value?: string; values?: string[] }

export type AdvertInput = {
  title: string
  description: string
  price: string
  negotiable: boolean
  category_id: number
  attributes: AdvertAttribute[]
  images: string[]
  city_id: number
  district_id: number | null
  contact_name: string
  contact_phone: string | null
  advertiser_type: "private" | "business"
}

export type Advert = {
  id: string
  variant_id: string
  product_id: string
  olx_advert_id: string | null
  status: string
  url: string | null
  valid_to: string | null
  title: string
  price: string
  payload: AdvertInput
  last_error: string | null
  pending_deactivate: boolean
  sold_channel: "store" | "olx" | null
  sold_at: string | null
  synced_at: string | null
  created_at: string | null
}

export type Issue = { field: string; code: string }

export type WriteResult =
  | { result: "published" | "saved"; advert: Advert }
  | { result: "unconfirmed"; advert: Advert; message: string }
  | { result: "invalid"; issues: Issue[] }
  | { result: "conflict"; code: "exists" | "in_progress" | "not_on_olx" | "out_of_stock" }
  | { result: "refused"; message: string; fields?: Array<{ field: string; detail: string }> }

export type BulkRow = { variant_id: string; title: string } & (
  | { result: "published" | "saved" }
  | { result: "unconfirmed"; message: string }
  | { result: "invalid"; issues: Issue[] }
  | { result: "conflict"; code: string }
  | { result: "refused"; message: string }
)

export type Safety = {
  placed_before_2024?: boolean
  manufacturer?: { name?: string; country?: string; address?: string; email?: string }
  warning_and_safety?: string
}

export type Settings = {
  contact_name: string
  contact_phone: string
  city_id: number | null
  city_name: string
  district_id: number | null
  advertiser_type: "private" | "business"
  negotiable: boolean
  category_id: number | null
  category_name: string
  safety: Safety
}

export type ConnectionInfo = {
  connected: boolean
  needs_reconnect: boolean
  user_name: string | null
  is_business: boolean
  last_error: string | null
}

export type OlxStatus =
  | { enabled: false; disabled_reason: string; version: string }
  | {
      enabled: true
      version: string
      demo: boolean
      connection: ConnectionInfo
      counts: Record<string, number>
      options: {
        demo: boolean
        client_id: string
        redirect_uri: string | null
        admin_url: string | null
        base_url: string
        timeout_ms: number
      }
    }

export type ProductVariant = {
  variant_id: string
  variant_title: string | null
  sku: string | null
  store_price: string | null
  in_stock: boolean | null
  stock_managed: boolean
  draft: AdvertInput
  advert: Advert | null
  price_differs: boolean
}

export type ProductState = {
  product_id: string
  title: string
  thumbnail: string | null
  images: Array<{ url: string; usable: boolean }>
  variants: ProductVariant[]
}

export type Category = { id: number; name: string; path: string[] }
export type Attribute = {
  code: string
  label: string
  unit: string | null
  required: boolean
  numeric: boolean
  multiple: boolean
  values: Array<{ code: string; label: string }>
}
export type City = { id: number; name: string; county: string | null }
export type District = { id: number; name: string }

/* Hooks ------------------------------------------------------------------- */

const BASE = "/admin/olx"
export const KEY = "olx"
export const keys = { all: [KEY] as const }

export function useOlxStatus() {
  return useQuery({ queryKey: [KEY, "status"], queryFn: () => sdk.client.fetch<OlxStatus>(`${BASE}/status`) })
}

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: [KEY, "settings"],
    queryFn: async () => (await sdk.client.fetch<{ settings: Settings }>(`${BASE}/settings`)).settings,
    enabled,
  })
}

export function useSaveSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (body: Settings) =>
      (await sdk.client.fetch<{ settings: Settings }>(`${BASE}/settings`, { method: "POST", body })).settings,
    onSuccess: (data) => {
      client.setQueryData([KEY, "settings"], data)
      client.invalidateQueries({ queryKey: [KEY, "product"] })
      client.invalidateQueries({ queryKey: ["kit-setup"] })
    },
  })
}

export function useConnect() {
  return useMutation({
    mutationFn: () => sdk.client.fetch<{ url: string }>(`${BASE}/connection`, { method: "POST" }),
  })
}

export function useDisconnect() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => sdk.client.fetch(`${BASE}/connection`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useAdverts(params: { limit: number; offset: number; q?: string; status?: string }, enabled = true) {
  return useQuery({
    queryKey: [KEY, "adverts", params],
    queryFn: () =>
      sdk.client.fetch<{ adverts: Advert[]; count: number }>(`${BASE}/adverts`, {
        query: {
          limit: params.limit,
          offset: params.offset,
          q: params.q || undefined,
          status: params.status || undefined,
        },
      }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useProductState(productId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: [KEY, "product", productId],
    queryFn: async () => (await sdk.client.fetch<{ product: ProductState }>(`${BASE}/products/${productId}`)).product,
    enabled: enabled && Boolean(productId),
  })
}

function useRefreshAfterWrite() {
  const client = useQueryClient()
  return () => {
    client.invalidateQueries({ queryKey: [KEY] })
    client.invalidateQueries({ queryKey: ["kit-setup"] })
    // "Sold on OLX" changes stock on Medusa's own pages.
    client.invalidateQueries({ queryKey: ["products"] })
    client.invalidateQueries({ queryKey: ["product_variants"] })
    client.invalidateQueries({ queryKey: ["inventory_items"] })
  }
}

export function usePublish() {
  const refresh = useRefreshAfterWrite()
  return useMutation({
    mutationFn: (body: { variant_id: string; product_id: string; advert: AdvertInput }) =>
      sdk.client.fetch<WriteResult>(`${BASE}/publish`, { method: "POST", body }),
    onSuccess: refresh,
  })
}

export function useBulkPublish() {
  const refresh = useRefreshAfterWrite()
  return useMutation({
    mutationFn: (body: { variant_ids: string[]; category_id: number; attributes: AdvertAttribute[] }) =>
      sdk.client.fetch<{ results: BulkRow[] }>(`${BASE}/publish-bulk`, { method: "POST", body }),
    onSuccess: refresh,
  })
}

export function useUpdateAdvert() {
  const refresh = useRefreshAfterWrite()
  return useMutation({
    mutationFn: ({ id, advert }: { id: string; advert: AdvertInput }) =>
      sdk.client.fetch<WriteResult>(`${BASE}/adverts/${id}/edit`, { method: "POST", body: advert }),
    onSuccess: refresh,
  })
}

export function useAdvertCommand() {
  const refresh = useRefreshAfterWrite()
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: "deactivate" | "activate" | "sold" }) =>
      sdk.client.fetch<WriteResult>(`${BASE}/adverts/${id}/commands`, { method: "POST", body: { command } }),
    onSuccess: refresh,
  })
}

export function useSyncNow() {
  const refresh = useRefreshAfterWrite()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ summary: { errors: string[]; changed: number; taken_down: number } }>(`${BASE}/sync`, {
        method: "POST",
      }),
    onSuccess: refresh,
  })
}

export function useDemoReset() {
  const refresh = useRefreshAfterWrite()
  return useMutation({
    mutationFn: () => sdk.client.fetch<{ removed: number }>(`${BASE}/demo/reset`, { method: "POST" }),
    onSuccess: refresh,
  })
}

export function useCategories(q: string) {
  return useQuery({
    queryKey: [KEY, "categories", q],
    queryFn: async () =>
      (await sdk.client.fetch<{ categories: Category[] }>(`${BASE}/categories`, { query: { q } })).categories,
    enabled: q.trim().length >= 3,
    retry: false,
    staleTime: 300_000,
  })
}

export function useAttributes(categoryId: number | null) {
  return useQuery({
    queryKey: [KEY, "attributes", categoryId],
    queryFn: async () =>
      (await sdk.client.fetch<{ attributes: Attribute[] }>(`${BASE}/category-attributes/${categoryId}`)).attributes,
    enabled: Boolean(categoryId),
    retry: false,
    staleTime: 3_600_000,
  })
}

export function useCities(q: string) {
  return useQuery({
    queryKey: [KEY, "cities", q],
    queryFn: async () => (await sdk.client.fetch<{ cities: City[] }>(`${BASE}/cities`, { query: { q } })).cities,
    enabled: q.trim().length >= 2,
    retry: false,
    staleTime: 3_600_000,
  })
}

export function useDistricts(cityId: number | null) {
  return useQuery({
    queryKey: [KEY, "districts", cityId],
    queryFn: async () =>
      (await sdk.client.fetch<{ districts: District[] }>(`${BASE}/city-districts/${cityId}`)).districts,
    enabled: Boolean(cityId),
    retry: false,
    staleTime: 3_600_000,
  })
}

export type ProductOption = {
  id: string
  title: string
  thumbnail?: string | null
  variants?: Array<{ id: string; title: string | null }>
}

export function useProductSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "pick-products", q],
    queryFn: async () =>
      (
        await sdk.client.fetch<{ products: ProductOption[] }>("/admin/products", {
          query: { q: q || undefined, limit: 20, fields: "id,title,thumbnail,variants.id,variants.title" },
        })
      ).products,
    enabled,
    placeholderData: keepPreviousData,
  })
}
