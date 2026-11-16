import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { backendUrl, sdk } from "./kit/sdk"

/* Types (mirroring the admin API) ----------------------------------------- */

export type RewardKind = "fixed" | "percentage" | "free_shipping" | "gift"
export type EntryType = "order" | "action" | "redemption" | "return" | "expiry" | "adjustment" | "tier_bonus"
export type Tier = { id: string; name: string; threshold: number; multiplier: number; bonus_points: number }

export type Settings = {
  enabled: boolean
  /** `null`: the store's default currency. */
  currency_code: string | null
  earn: { points: number; per_amount: number; base: "gross" | "net" }
  actions: {
    signup: { enabled: boolean; points: number }
    first_order: { enabled: boolean; points: number }
    birthday: { enabled: boolean; points: number; change_interval_days: number; min_days_before: number }
    newsletter: { enabled: boolean; points: number }
  }
  tiers: { window_months: number; levels: Tier[] }
  expiry: { enabled: boolean; months: number; reminder_days: number }
  rewards: { return_points_on_code_expiry: boolean; gift_release_days: number }
  excluded_group_ids: string[]
  terms_url: string | null
  /** `{ eur: 4.3 }`: 1 EUR counts as 4.30 in the program currency. Currencies without a rate earn nothing. */
  currency_rates: Record<string, number>
}

export type SettingsResponse =
  | { enabled: false; disabled_reason: string; version: string }
  | {
      enabled: true
      version: string
      options: { timeZone: string; defaultLocale: "pl" | "en" }
      settings: Settings
      defaults: Settings
      /** The store's currencies, the default first. */
      store_currencies: string[]
      /** The currency the program uses now (the chosen one, else the store's default). */
      currency_code: string
    }

export type Dashboard = {
  members: number
  earned_30d: number
  redeemed_30d: number
  open_points: number
  open_value: number | null
  point_value: number | null
  currency_code: string
  tiers: Array<{ id: string | null; name: string | null; customers: number }>
  top_rewards: Array<{ id: string; name: string; kind: RewardKind; redemptions: number }>
  expiring_30d: number
}

export type Reward = {
  id: string
  name: string
  description: string | null
  kind: RewardKind
  value: number | null
  currency_code: string | null
  variant_id: string | null
  cost: number
  active: boolean
  min_tier_id: string | null
  per_customer_limit: number | null
  code_valid_days: number | null
  redemptions: number
}
export type RewardInput = Omit<Reward, "id" | "redemptions">

export type CustomerRow = {
  id: string
  email: string | null
  name: string | null
  balance: number
  tier: { id: string; name: string } | null
  last_activity_at: string | null
  excluded: boolean
}

export type Summary = {
  customer_id: string
  program_enabled: boolean
  member: boolean
  not_member_reason: string | null
  balance: number
  tier: { id: string; name: string; threshold: number; multiplier: number } | null
  spend: number
  next_tier: { id: string; name: string; threshold: number; remaining: number } | null
  expires_at: string | null
  last_activity_at: string | null
  birthday: string | null
  currency_code: string
}

export type Entry = {
  id: string
  type: EntryType
  reason: string
  points: number
  balance_after: number
  description: string | null
  order_id: string | null
  code: string | null
  actor_type: "system" | "admin" | "customer"
  actor_id: string | null
  created_at: string
}

export type CustomerDetail = {
  summary: Summary
  tier_changes: Array<{
    id: string
    from_tier_id: string | null
    to_tier_id: string | null
    spend: number
    trigger: string
    created_at: string
  }>
  redemptions: Array<{
    id: string
    reward_name: string
    kind: RewardKind
    cost: number
    status: string
    code: string | null
    expires_at: string | null
    created_at: string
  }>
}

const KEY = "loyalty"

/* Queries ----------------------------------------------------------------- */

export const useSettings = () =>
  useQuery({
    queryKey: [KEY, "settings"],
    queryFn: () => sdk.client.fetch<SettingsResponse>("/admin/loyalty/settings"),
  })

export const useDashboard = () =>
  useQuery({ queryKey: [KEY, "dashboard"], queryFn: () => sdk.client.fetch<Dashboard>("/admin/loyalty/dashboard") })

export const useRewards = () =>
  useQuery({
    queryKey: [KEY, "rewards"],
    queryFn: () => sdk.client.fetch<{ rewards: Reward[] }>("/admin/loyalty/rewards"),
  })

export const useCustomers = (params: { q: string; offset: number; limit: number }) =>
  useQuery({
    queryKey: [KEY, "customers", params],
    placeholderData: keepPreviousData,
    queryFn: () =>
      sdk.client.fetch<{ customers: CustomerRow[]; count: number }>("/admin/loyalty/customers", {
        query: { offset: params.offset, limit: params.limit, ...(params.q ? { q: params.q } : {}) },
      }),
  })

export const useCustomer = (id: string | null) =>
  useQuery({
    queryKey: [KEY, "customer", id],
    enabled: !!id,
    queryFn: () => sdk.client.fetch<CustomerDetail>(`/admin/loyalty/customers/${id}`),
  })

export type EntryFilters = { type?: EntryType; from?: string; to?: string; offset: number; limit: number }

export const useEntries = (id: string | null, filters: EntryFilters) =>
  useQuery({
    queryKey: [KEY, "entries", id, filters],
    enabled: !!id,
    placeholderData: keepPreviousData,
    queryFn: () =>
      sdk.client.fetch<{ entries: Entry[]; count: number; balance: number }>(`/admin/loyalty/customers/${id}/entries`, {
        query: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")),
      }),
  })

export const entriesCsvUrl = (id: string, filters: Omit<EntryFilters, "offset" | "limit">, locale: "pl" | "en") => {
  const query = new URLSearchParams({
    format: "csv",
    locale,
    ...(Object.fromEntries(Object.entries(filters).filter(([, v]) => !!v)) as Record<string, string>),
  })
  return backendUrl(`/admin/loyalty/customers/${id}/entries?${query}`)
}

export const usePreview = (body: { amount: number; tier_id: string | null; balance: number }) =>
  useQuery({
    queryKey: [KEY, "preview", body],
    placeholderData: keepPreviousData,
    queryFn: () =>
      sdk.client.fetch<{ points: number; texts: Record<"pl" | "en", Record<string, string | null>> }>(
        "/admin/loyalty/preview",
        {
          method: "POST",
          body,
        }
      ),
  })

/* Mutations --------------------------------------------------------------- */

function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [KEY] })
}

export function useSaveSettings() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (settings: Settings) =>
      sdk.client.fetch<{ settings: Settings }>("/admin/loyalty/settings", { method: "POST", body: settings }),
    onSuccess: invalidate,
  })
}

export function useSaveReward(id?: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: RewardInput) =>
      sdk.client.fetch(id ? `/admin/loyalty/rewards/${id}` : "/admin/loyalty/rewards", { method: "POST", body }),
    onSuccess: invalidate,
  })
}

export function useDeleteReward() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/loyalty/rewards/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
}

export function useAdjust(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { points: number; reason: string; request_id: string }) =>
      sdk.client.fetch<{ balance: number; created: boolean }>(`/admin/loyalty/customers/${id}/adjust`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  })
}

export function useGrantNewsletter(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ points: number; granted: boolean }>(`/admin/loyalty/customers/${id}/newsletter`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  })
}

/* Pickers ----------------------------------------------------------------- */

export type Option = { value: string; label: string }

export const useGroupOptions = (q: string) =>
  useQuery({
    queryKey: [KEY, "groups", q],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Option[]> =>
      (await sdk.admin.customerGroup.list({ q: q || undefined, limit: 50 })).customer_groups.map((g) => ({
        value: g.id,
        label: g.name ?? g.id,
      })),
  })

export const useGroupLabels = (ids: string[]) =>
  useQuery({
    queryKey: [KEY, "group-labels", ids],
    enabled: ids.length > 0,
    queryFn: async () =>
      Object.fromEntries(
        (await sdk.admin.customerGroup.list({ id: ids, limit: ids.length })).customer_groups.map((g) => [
          g.id,
          g.name ?? g.id,
        ])
      ) as Record<string, string>,
  })

/** Product variants for the gift picker: "Product – Variant". */
export const useVariantOptions = (q: string) =>
  useQuery({
    queryKey: [KEY, "variants", q],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Option[]> => {
      const { products } = await sdk.admin.product.list({
        q: q || undefined,
        limit: 20,
        fields: "id,title,variants.id,variants.title,variants.sku",
      })
      return products.flatMap((p) =>
        (p.variants ?? []).map((v) => ({ value: v.id, label: `${p.title} – ${v.title ?? v.sku ?? v.id}` }))
      )
    },
  })

export const useVariantLabel = (id: string | null) =>
  useQuery({
    queryKey: [KEY, "variant-label", id],
    enabled: !!id,
    queryFn: async () => {
      const { variants } = await sdk.admin.productVariant.list({
        id: [id!],
        fields: "id,title,sku,product.title",
        limit: 1,
      })
      const v = variants[0]
      return v ? `${v.product?.title ?? ""} – ${v.title ?? v.sku ?? v.id}` : id
    },
  })
