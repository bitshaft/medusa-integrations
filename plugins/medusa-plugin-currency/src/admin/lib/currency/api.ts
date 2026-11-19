import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

export type Rounding = "none" | "whole" | "x99" | "x49_99" | "five" | "ten"
export type RateMode = "fixed" | "api" | "api_margin"
export type TaxMode = "gross" | "net"

export const ROUNDINGS: Rounding[] = ["none", "whole", "x99", "x49_99", "five", "ten"]
export const RATE_MODES: RateMode[] = ["api", "api_margin", "fixed"]

export type CurrencyRule = {
  enabled: boolean
  mode: RateMode
  fixedRate: string | null
  marginPercent: string
  rounding: Rounding
  tax: TaxMode
  taxCountry: string | null
}

export type Settings = {
  baseCurrency: string | null
  baseTaxCountry: string | null
  currencies: Record<string, CurrencyRule>
}

export type StoreCurrency = { code: string; name: string; symbol: string; decimals: number; is_default: boolean }
export type Region = { id: string; name: string; currency: string; countries: string[] }

export type SettingsResponse = {
  settings: Settings
  rules: Record<string, CurrencyRule>
  store: {
    currencies: StoreCurrency[]
    base: StoreCurrency | null
    regions: Region[]
    taxInclusive: { currency: Record<string, boolean>; region: Record<string, boolean> }
    taxRates: Record<string, string | null>
    baseTaxCountry: string | null
  }
}

export type CurrencyStatus =
  | { enabled: false; disabled_reason: string; version: string }
  | {
      enabled: true
      version: string
      demo: boolean
      options: { demo: boolean; provider: string; nbp_base_url: string; nbp_timeout_ms: number; max_variants: number }
      counts: { runs: number }
    }

export type RateTable = { provider: string; table: string; date: string; base: string; rates: Record<string, string> }
export type RateStatus = "fresh" | "stale" | "unavailable" | "demo"
export type RateLookup = {
  table: RateTable | null
  status: RateStatus
  checked_at: string | null
  next_expected: string | null
  error: string | null
}

export type RateSource = { provider: string; table: string; date: string; stale: boolean }
export type ResolvedRate = {
  currency: string
  mode: RateMode
  rate: string
  margin: string
  effective: string
  source: RateSource | null
}
export type RateProblem = "rates_unavailable" | "rate_missing" | "fixed_rate_missing"

export type RatesResponse = RateLookup & {
  provider: string
  demo: boolean
  base: string | null
  currencies: Array<{
    code: string
    enabled: boolean
    mode: RateMode
    rate: ResolvedRate | null
    reason: RateProblem | null
  }>
}

export type TaxStep = "gross" | "net" | "strip" | "add" | "none"
export type Warning = "tax_differs" | "rounding_fallback" | "stale_rate"

export type SampleResponse = {
  amount: string
  base: string
  rate: ResolvedRate | null
  reason?: RateProblem
  conversion?:
    | { ok: true; amount: string; exact: string; tax: TaxStep; warnings: Warning[] }
    | { ok: false; reason: "tax_rate_missing" }
  tax?: {
    base: { inclusive: boolean; rate: string | null; country: string | null }
    target: { inclusive: boolean; rate: string | null; country: string | null }
  }
  lookup: RateLookup | null
}

export type SkipReason =
  "no_price_set" | "no_base_price" | "already_set" | "same_amount" | "tax_rate_missing" | RateProblem

export type PriceOrigin =
  { kind: "manual" } | { kind: "filled"; run_id: string; at: string; rate: string; table: string | null }

export type PlanRow = {
  key: string
  variant_id: string
  variant_title: string | null
  sku: string | null
  product_id: string
  product_title: string
  thumbnail: string | null
  currency: string
  price_list_id: string | null
  price_list_title: string | null
  region_id: string | null
  region_name: string | null
  min_quantity: string | null
  max_quantity: string | null
  base_amount: string | null
  current: { id: string; amount: string; origin: PriceOrigin } | null
  new_amount: string | null
  rate: ResolvedRate | null
  tax: TaxStep | null
  tax_rates: { base: string | null; target: string | null } | null
  action: "add" | "overwrite" | "skip"
  reason: SkipReason | null
  warnings: Warning[]
}

export type Preview = {
  demo: boolean
  base: StoreCurrency
  targets: Array<{
    code: string
    decimals: number
    rule: CurrencyRule
    rate: { ok: true; rate: ResolvedRate } | { ok: false; reason: RateProblem }
  }>
  rates: RateLookup | null
  plan: { rows: PlanRow[]; counts: { add: number; overwrite: number; skip: number }; fingerprint: string }
}

export type FillScope =
  | { kind: "products"; ids: string[] }
  | { kind: "collection"; id: string }
  | { kind: "category"; id: string }
  | { kind: "demo" }

export type FillRequest = {
  scope: FillScope
  currencies?: string[]
  overwrite: boolean
  price_lists: boolean
  region_prices: boolean
  allow_stale: boolean
}

export type FillRun = {
  id: string
  actor_id: string | null
  actor_name: string | null
  demo: boolean
  base_currency: string
  scope: { kind: string; ids?: string[]; id?: string; labels?: string[] }
  run_options: { overwrite: boolean; price_lists: boolean; region_prices: boolean; currencies: string[] }
  rates: Record<
    string,
    {
      mode: RateMode
      rate: string
      margin: string
      effective: string
      provider: string | null
      table: string | null
      date: string | null
      stale?: boolean
      rounding?: Rounding
      tax?: TaxMode
    }
  >
  added: number
  overwritten: number
  skipped: number
  skipped_by: Record<string, number>
  products: Array<{ id: string; title: string }>
  created_at: string
}

export type FilledPrice = {
  id: string
  price_id: string
  variant_id: string
  product_id: string
  currency_code: string
  price_list_id: string | null
  region_id: string | null
  action: "add" | "overwrite"
  amount: string
  previous_amount: string | null
  base_amount: string
  rate: string
  table_no: string | null
  rate_date: string | null
}

export type ProductPriceOrigin =
  | { kind: "manual" }
  | {
      kind: "filled"
      run_id: string
      at: string
      mode: RateMode
      rate: string
      margin: string
      table: string | null
      rate_date: string | null
    }

export type ProductPrices = {
  demo: boolean
  base: string | null
  targets: string[]
  currencies: StoreCurrency[]
  missing: Record<string, number>
  variants: Array<{
    id: string
    title: string | null
    sku: string | null
    has_base: boolean
    missing: string[]
    prices: Array<{
      id: string
      currency: string
      amount: string
      price_list_id: string | null
      price_list_title: string | null
      region_id: string | null
      region_name: string | null
      min_quantity: string | null
      max_quantity: string | null
      origin: ProductPriceOrigin | null
    }>
  }>
}

/* Hooks ------------------------------------------------------------------- */

const BASE = "/admin/currency"
export const KEY = "currency"
export const keys = { all: [KEY] as const }

export function useCurrencyStatus() {
  return useQuery({ queryKey: [KEY, "status"], queryFn: () => sdk.client.fetch<CurrencyStatus>(`${BASE}/status`) })
}

const useEnabled = () => useCurrencyStatus().data?.enabled === true

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: [KEY, "settings"],
    queryFn: () => sdk.client.fetch<SettingsResponse>(`${BASE}/settings`),
    enabled,
  })
}

export function useSaveSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: Settings) => sdk.client.fetch<SettingsResponse>(`${BASE}/settings`, { method: "POST", body }),
    onSuccess: (data) => {
      client.setQueryData([KEY, "settings"], data)
      client.invalidateQueries({ queryKey: [KEY, "rates"] })
      client.invalidateQueries({ queryKey: [KEY, "product"] })
    },
  })
}

export function useRates(enabled = true) {
  return useQuery({
    queryKey: [KEY, "rates"],
    queryFn: () => sdk.client.fetch<RatesResponse>(`${BASE}/rates`),
    enabled,
  })
}

/** "Refresh rates": asks the source now. */
export function useRefreshRates() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => sdk.client.fetch<RatesResponse>(`${BASE}/rates`, { query: { refresh: "true" } }),
    onSuccess: (data) => client.setQueryData([KEY, "rates"], data),
  })
}

/** What 100.00 in the base currency becomes under a rule being edited. */
export function useSample(
  input: { currency: string; rule: CurrencyRule; base_currency: string | null; base_tax_country: string | null } | null
) {
  return useQuery({
    queryKey: [KEY, "sample", input],
    queryFn: () => sdk.client.fetch<SampleResponse>(`${BASE}/sample`, { method: "POST", body: input! }),
    enabled: Boolean(input),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function usePreview() {
  return useMutation({
    mutationFn: (body: FillRequest) => sdk.client.fetch<Preview>(`${BASE}/preview`, { method: "POST", body }),
  })
}

export type ApplyResponse = { status: "saved"; run_id: string; demo: boolean; counts: Preview["plan"]["counts"] }

export function useApply() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: FillRequest & { fingerprint: string; confirm_overwrite: boolean }) =>
      sdk.client.fetch<ApplyResponse>(`${BASE}/apply`, { method: "POST", body }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [KEY] })
      // Medusa's own product pages show the new prices.
      client.invalidateQueries({ queryKey: ["products"] })
      client.invalidateQueries({ queryKey: ["product_variants"] })
    },
  })
}

export function useRuns(params: { limit: number; offset: number; product_id?: string }, enabled = true) {
  return useQuery({
    queryKey: [KEY, "runs", params],
    queryFn: () => sdk.client.fetch<{ runs: FillRun[]; count: number }>(`${BASE}/runs`, { query: params }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useRun(id: string | null) {
  return useQuery({
    queryKey: [KEY, "run", id],
    queryFn: () => sdk.client.fetch<{ run: FillRun; prices: FilledPrice[] }>(`${BASE}/runs/${id}`),
    enabled: Boolean(id),
  })
}

export function useProductPrices(productId: string | null | undefined) {
  const enabled = useEnabled()
  return useQuery({
    queryKey: [KEY, "product", productId],
    queryFn: () => sdk.client.fetch<ProductPrices>(`${BASE}/products/${productId}`),
    enabled: enabled && Boolean(productId),
  })
}

/* Medusa's own lists, for choosing what to fill ----------------------------- */

export type Option = { id: string; title: string; thumbnail?: string | null }

export function useProductSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "pick-products", q],
    queryFn: async () =>
      (
        await sdk.client.fetch<{ products: Option[] }>("/admin/products", {
          query: { q: q || undefined, limit: 20, fields: "id,title,thumbnail" },
        })
      ).products,
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useProductTitles(ids: string[]) {
  return useQuery({
    queryKey: [KEY, "product-titles", ids],
    queryFn: async () => {
      const { products } = await sdk.client.fetch<{ products: Option[] }>("/admin/products", {
        query: { id: ids, limit: ids.length, fields: "id,title" },
      })
      return Object.fromEntries(products.map((product) => [product.id, product.title]))
    },
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  })
}

export function useCollections(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "pick-collections"],
    queryFn: async () =>
      (
        await sdk.client.fetch<{ collections: Option[] }>("/admin/collections", {
          query: { limit: 200, fields: "id,title" },
        })
      ).collections,
    enabled,
  })
}

export function useCategories(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "pick-categories"],
    queryFn: async () =>
      (
        await sdk.client.fetch<{ product_categories: Array<{ id: string; name: string }> }>(
          "/admin/product-categories",
          {
            query: { limit: 500, fields: "id,name" },
          }
        )
      ).product_categories.map((category) => ({ id: category.id, title: category.name })),
    enabled,
  })
}
