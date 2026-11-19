import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { backendUrl, sdk } from "./kit/sdk"

/* Types (mirroring the admin API) ----------------------------------------- */

export type Locale = "pl" | "en"
/** Text per store language (ISO 639: `pl`, `en`, `fr`). */
export type Localized = Partial<Record<string, string>>
export type Party = {
  name: string | null
  trade_name: string | null
  postal_address: string | null
  electronic_address: string | null
}
export type RequestType = "access" | "portability" | "erasure" | "objection" | "rectification"
export type RequestStatus = "unverified" | "open" | "accepted" | "completed" | "rejected" | "expired"
export type Placement = "registration" | "checkout" | "account" | "newsletter" | "cookies"
export type CookieCategory = "necessary" | "analytics" | "marketing"

export type OmnibusException = {
  target: "product" | "category"
  id: string
  label: string
  rule: "exempt" | "gradual"
  note: string
}

export type Settings = {
  modules: { gpsr: boolean; gdpr: boolean; omnibus: boolean }
  demo: boolean
  gpsr: {
    require: {
      manufacturer_trade_name: boolean
      identification_type: boolean
      identification_model: boolean
      label_image: boolean
      warnings: boolean
    }
    /** ISO 639 codes (`pl`, `de`), from the store's languages. */
    warning_languages: string[]
  }
  gdpr: {
    response_days: number
    warn_days: number
    token_hours: number
    verify_url: string
    privacy_policy_url: string
    request_notice: string
    rate_limit: { per_email: number; per_ip: number; window_minutes: number }
    anonymize: {
      placeholder: string
      customer_metadata: boolean
      order_email: boolean
      order_phone: boolean
      order_shipping_address: boolean
      order_billing_address: boolean
      billing_retention_months: number
      carts: boolean
    }
  }
  omnibus: {
    period_days: number
    automatic_promotions: boolean
    code_promotions: boolean
    tax_country: Record<string, string>
    exceptions: OmnibusException[]
  }
}

export type SettingsResponse = {
  enabled: boolean
  disabled_reason: string | null
  settings: Settings
  version: string | null
  options: { timeZone: string; defaultLocale: Locale; dataProviders: string[] }
  omnibus_started_at: string | null
  regions: Array<{ id: string; name: string; countries: string[] }>
  lawyer_placeholder: string
  /** The store's languages (ISO 639), the plugin's default first. */
  store_languages: string[]
}

export type Dashboard = {
  demo: boolean
  modules: Settings["modules"]
  gpsr: { products: number; incomplete: number; checked_at: string | null }
  gdpr: {
    open: number
    unverified: number
    due_soon: number
    overdue: number
    next_deadline: { id: string; type: RequestType; deadline_at: string; days_left: number } | null
  }
  omnibus: { started_at: string | null; discounted_products: number; incomplete: number }
}

export type GpsrProduct = {
  product_id: string
  title: string | null
  status: string | null
  gaps: string[]
  complete: boolean
  checked_at: string | null
}

export type Manufacturer = {
  id: string
  name: string
  manufacturer: Partial<Party>
  outside_eu: boolean
  responsible: Partial<Party>
  products: number
}

export type ProductSafetyData = {
  manufacturer_id: string | null
  manufacturer: Partial<Party>
  outside_eu: boolean | null
  responsible: Partial<Party>
  identification: { type: string | null; model: string | null; batch: string | null; batch_applicable: boolean }
  label_image_url: string | null
  /** Markdown per language code (`pl`, `de`). */
  warnings: Partial<Record<string, string>>
}

export type ProductSafety = {
  demo: boolean
  data: ProductSafetyData | null
  profile: { id: string; name: string } | null
  effective: {
    manufacturer: Party
    outside_eu: boolean
    responsible: Party | null
  }
  gaps: string[]
  checked_at: string | null
  storefront: { warnings: { html: string } }
}

export type ConsentType = {
  key: string
  name: Localized
  placement: Placement
  required: boolean
  active: boolean
  cookie_category: CookieCategory | null
  versions: Array<{ version: number; text: Localized; created_at: string }>
  granted: number
}

export type ConsentEntry = {
  id: string
  type_key: string
  version: number
  granted: boolean
  customer_id: string | null
  email: string | null
  anonymous_id: string | null
  source: string
  placement: string | null
  actor_type: string
  created_at: string
}

export type ComplianceRequest = {
  id: string
  type: RequestType
  status: RequestStatus
  email: string
  customer_id: string | null
  locale: string
  details: string | null
  created_at: string
  verified_at: string | null
  deadline_at: string | null
  closed_at: string | null
  days_left: number | null
}

export type RequestEvent = {
  id: string
  action: string
  actor_type: string
  actor_id: string | null
  note: string | null
  data: Record<string, unknown> | null
  created_at: string
}

export type RequestDetail = {
  demo: boolean
  request: ComplianceRequest
  events: RequestEvent[]
  erasure: {
    customer: { id: string; email: string; first_name?: string; last_name?: string } | null
    orders: number
    open_orders: number
    already: boolean
  } | null
}

export type OmnibusRow = {
  variant_id: string
  product_id: string
  product_title?: string | null
  variant_title?: string | null
  sku?: string | null
  region_id: string
  region_name?: string | null
  currency_code: string
  discounted: boolean
  amount: number | null
  regular: number | null
  lowest: number | null
  discount_started_at: string | null
  period_start: string | null
  history_incomplete: boolean
  sold_since: string | null
  exempt: boolean
}

export type PricePoint = {
  at: string
  amount: number
  regular: number
  discounted: boolean
  kind: string | null
  source: string
}

export type ProductPrices = {
  demo: boolean
  period_days: number
  started_at: string | null
  series: Array<OmnibusRow & { points: PricePoint[] }>
}

export type CustomerCompliance = {
  enabled: boolean
  demo: boolean
  consents: Array<{
    type_key: string
    granted: boolean
    version: number | null
    latest_version: number | null
    at: string | null
    outdated: boolean
  }>
  requests: Array<{ id: string; type: RequestType; status: RequestStatus; created_at: string }>
  anonymized: { created_at: string } | null
}

/* Queries -------------------------------------------------------------------- */

const get = <T>(path: string, query?: Record<string, unknown>) =>
  sdk.client.fetch<T>(`/admin/compliance${path}`, query ? { query } : undefined)
const post = <T>(path: string, body: unknown) =>
  sdk.client.fetch<T>(`/admin/compliance${path}`, { method: "POST", body: body as Record<string, unknown> })

export const keys = {
  all: ["compliance"] as const,
  settings: ["compliance", "settings"] as const,
}

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => get<SettingsResponse>("/settings") })

export const useDashboard = () =>
  useQuery({ queryKey: ["compliance", "dashboard"], queryFn: () => get<Dashboard>("/dashboard") })

export const useGpsrProducts = (query: { complete?: "true" | "false"; q?: string; limit: number; offset: number }) =>
  useQuery({
    queryKey: ["compliance", "gpsr", "products", query],
    queryFn: () =>
      get<{ products: GpsrProduct[]; count: number }>(
        "/gpsr/products",
        Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ""))
      ),
    placeholderData: keepPreviousData,
  })

export const useManufacturers = () =>
  useQuery({
    queryKey: ["compliance", "manufacturers"],
    queryFn: () => get<{ manufacturers: Manufacturer[] }>("/manufacturers"),
  })

export const useProductSafety = (productId: string, enabled = true) =>
  useQuery({
    queryKey: ["compliance", "gpsr", "product", productId],
    queryFn: () => get<ProductSafety>(`/gpsr/products/${productId}`),
    enabled,
  })

export const useConsentTypes = () =>
  useQuery({
    queryKey: ["compliance", "consent-types"],
    queryFn: () => get<{ types: ConsentType[] }>("/consents/types"),
  })

export const useConsentEntries = (query: { type_key?: string; email?: string; limit: number; offset: number }) =>
  useQuery({
    queryKey: ["compliance", "consent-entries", query],
    queryFn: () =>
      get<{ entries: ConsentEntry[]; count: number }>(
        "/consents/entries",
        Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ""))
      ),
    placeholderData: keepPreviousData,
  })

export const useRequests = (query: { status?: string; type?: string; limit: number; offset: number }) =>
  useQuery({
    queryKey: ["compliance", "requests", query],
    queryFn: () =>
      get<{ requests: ComplianceRequest[]; count: number }>(
        "/requests",
        Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ""))
      ),
    placeholderData: keepPreviousData,
  })

export const useRequest = (id: string | null) =>
  useQuery({
    queryKey: ["compliance", "request", id],
    queryFn: () => get<RequestDetail>(`/requests/${id}`),
    enabled: Boolean(id),
  })

export const useDiscounts = () =>
  useQuery({
    queryKey: ["compliance", "omnibus", "discounts"],
    queryFn: () =>
      get<{ started_at: string | null; period_days: number; discounts: OmnibusRow[] }>("/omnibus/discounts"),
  })

export const useProductPrices = (productId: string, enabled = true) =>
  useQuery({
    queryKey: ["compliance", "omnibus", "product", productId],
    queryFn: () => get<ProductPrices>(`/omnibus/products/${productId}`),
    enabled,
  })

export const useCustomerCompliance = (customerId: string) =>
  useQuery({
    queryKey: ["compliance", "customer", customerId],
    queryFn: () => get<CustomerCompliance>(`/customers/${customerId}`),
  })

/* Mutations ------------------------------------------------------------------ */

function useComplianceMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export const useSaveSettings = () =>
  useComplianceMutation((settings: Settings) => post<SettingsResponse>("/settings", settings))

export const useSaveManufacturer = () =>
  useComplianceMutation((input: { id?: string } & Omit<Manufacturer, "id" | "products">) => {
    const { id, ...body } = input
    return post<{ manufacturer: Manufacturer }>(id ? `/manufacturers/${id}` : "/manufacturers", body)
  })

export const useDeleteManufacturer = () =>
  useComplianceMutation((id: string) =>
    sdk.client.fetch<{ id: string }>(`/admin/compliance/manufacturers/${id}`, { method: "DELETE" })
  )

export const useSaveProductSafety = (productId: string) =>
  useComplianceMutation((data: ProductSafetyData) => post<ProductSafety>(`/gpsr/products/${productId}`, data))

export const useRecomputeGpsr = () =>
  useComplianceMutation(() => post<{ checked: number; incomplete: number }>("/gpsr/recompute", {}))

export const useSaveConsentType = () =>
  useComplianceMutation((input: Omit<ConsentType, "versions" | "granted"> & { text: Localized }) =>
    post<{ key: string; version: number; new_version: boolean }>("/consents/types", input)
  )

export const useRequestAction = (id: string) =>
  useComplianceMutation(
    (input: { action: "accept" | "reject" | "complete" | "note" | "anonymize"; note?: string | null }) =>
      post<RequestDetail>(`/requests/${id}`, input)
  )

export const useRecordPrices = () => useComplianceMutation(() => post<{ recorded: number }>("/omnibus/record", {}))

/** Opens a data export download (the session cookie authenticates it). */
export const exportUrl = (kind: "requests" | "customers", id: string, format: "zip" | "json") =>
  backendUrl(`/admin/compliance/${kind}/${id}/export?format=${format}`)
