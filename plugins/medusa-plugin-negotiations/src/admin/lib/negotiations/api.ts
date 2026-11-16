import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { backendUrl, sdk } from "./kit/sdk"

/* Types (mirroring the admin API). Amounts are integers in minor units. ---- */

export type Status = "open" | "countered" | "accepted" | "rejected" | "expired" | "withdrawn"
export type OfferMode = "unit" | "total" | "lines"
export type OfferLine = { variant_id: string; quantity: number; unit_price: number }
export type Offer = { mode: OfferMode; lines: OfferLine[]; total: number; requested_total?: number | null }
export type ThreadLine = {
  variant_id: string
  product_id: string | null
  product_title: string
  variant_title: string | null
  sku: string | null
  thumbnail: string | null
  quantity: number
  catalog_unit_price: number
}

export type Thread = {
  id: string
  number: string
  is_demo: boolean
  customer_id: string
  customer: { email: string | null; first_name: string | null; last_name: string | null; company_name: string | null }
  kind: "product" | "cart"
  lines: ThreadLine[]
  currency_code: string
  tax_inclusive: boolean
  quantity_total: number
  catalog_total: number
  target: Offer
  target_total: number
  offer: Offer | null
  offer_total: number | null
  offer_expires_at: string | null
  accepted: Offer | null
  accepted_total: number | null
  accepted_by: "customer" | "team" | null
  accepted_at: string | null
  accepted_until: string | null
  status: Status
  turn: "team" | "customer" | null
  assignee_id: string | null
  version: number
  last_activity_at: string
  last_author: "customer" | "team" | "system"
  first_team_reply_at: string | null
  closed_at: string | null
  draft_order_id: string | null
  order_id: string | null
  created_at: string
  expires_at: string | null
  next_deadline: string | null
  current_price: number
  discount_bp: number | null
}

export type Message = {
  id: string
  author: "customer" | "team" | "system"
  author_id: string | null
  type: string
  body: string | null
  price: Offer | null
  internal: boolean
  created_at: string
}

export type FloorCheck = {
  below: Array<{
    variant_id: string
    unit_price: number
    floor: number
    difference_per_unit: number
    difference_total: number
  }>
  max_discount: { max_basis_points: number; min_total: number; total: number; difference: number } | null
  needs_confirmation: boolean
}

export type Run = {
  id: string
  thread_id: string
  number: string | null
  writer: "draft_order" | "cart"
  stage: "plan" | "dry_run" | "commit" | "error"
  actor_type: string
  actor_id: string | null
  result: Record<string, any> | null
  error: string | null
  created_at: string
}

export type ThreadDetail = {
  negotiation: Thread
  messages: Message[]
  floors: Record<string, number>
  floor_checks: { target: FloorCheck | null; offer: FloorCheck | null }
  offer_modes: OfferMode[]
  writes: Array<{ id: string; kind: string; status: string; target_id: string | null; created_at: string }>
  runs: Run[]
  writers: { draft_orders: { on: boolean; armed: boolean }; cart: { on: boolean; armed: boolean } }
  customer_accept: boolean
  expiry_days: number
  max_discount_bp: number | null
}

export type ListResponse = {
  negotiations: Thread[]
  count: number
  counts: Record<string, number>
  oldest_waiting_id: string | null
  demo: boolean
}

export type Stats = {
  waiting: number
  open: number
  countered: number
  accepted_30: number
  rejected_30: number
  expired_30: number
  expiring_soon: number
  first_reply_seconds: number | null
  in_talks: Record<string, number>
  agreed_30: Record<string, number>
}

export type Settings = {
  cart_counter_modes: "total" | "lines" | "both"
  max_discount_bp: number | null
  armed: { draft_orders: boolean; cart: boolean }
}

export type SettingsResponse = {
  enabled: boolean
  disabled_reason: string | null
  package: string
  options: {
    expiryDays: number
    acceptedOfferDays: number
    defaultCurrency?: string
    customerAccept: boolean
    allowedCustomerGroups: string[]
    writers: { draftOrders: boolean; cart: boolean }
    limits: {
      openThreads: number
      threadsPerHour: number
      messagesPerHour: number
      messageLength: number
      maxQuantity: number
    }
    demo: boolean
  }
  settings: Settings
  /** Net or gross as the catalog sets it (Tax inclusive pricing); `null` when it couldn't be read. */
  price_bases: PriceBases | null
}

export type PriceBases = {
  currencies: Record<string, boolean>
  regions: Array<{ id: string; name: string; currency_code: string; tax_inclusive: boolean }>
}

export type PriceInput =
  | { mode: "unit"; unit_price: number }
  | { mode: "total"; total: number }
  | { mode: "lines"; lines: Array<{ variant_id: string; unit_price: number }> }

export type DraftPlan = {
  number: string
  customer: { id: string; email: string | null; name: string }
  currency_code: string
  region: { id: string; name: string } | null
  region_reason: "chosen" | "address_country" | "first_with_currency" | null
  regions: Array<{ id: string; name: string }>
  address: Record<string, any> | null
  addresses: Array<Record<string, any>>
  sales_channel: { id: string; name: string } | null
  sales_channels: Array<{ id: string; name: string }>
  items: Array<{
    variant_id: string
    title: string
    sku: string | null
    quantity: number
    unit_price: number
    total: number
  }>
  total: number
  /** Whether the draft order's prices include tax: the thread's. */
  tax_inclusive: boolean
  problems: string[]
}

export type GuideStep = { id: string; status: "done" | "todo" | "optional"; params?: Record<string, string | number> }

/** An admin API refusal: a code the admin translates, and for conflicts the current thread. */
export type ApiError = {
  code?: string
  params?: Record<string, string | number>
  message?: string
  floors?: FloorCheck
}

/* Requests ------------------------------------------------------------------ */

/** Thrown by admin calls: keeps the API's code, params and current thread (js-sdk keeps only the message). */
export class NegotiationsApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError & { negotiation?: Thread }
  ) {
    super(body.message ?? `HTTP ${status}`)
  }
}

async function call<T>(
  path: string,
  init: { method?: string; query?: Record<string, unknown>; body?: unknown } = {}
): Promise<T> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value))
  }
  const url = backendUrl(`/admin/negotiations${path}${search.size ? `?${search}` : ""}`)
  const response = await fetch(url, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new NegotiationsApiError(response.status, data)
  return data as T
}

const get = <T>(path: string, query?: Record<string, unknown>) => call<T>(path, { query })
const post = <T>(path: string, body: unknown = {}) => call<T>(path, { method: "POST", body })

export const keys = {
  all: ["negotiations"] as const,
  list: (filters: Record<string, unknown>) => ["negotiations", "list", filters] as const,
  stats: ["negotiations", "stats"] as const,
  thread: (id: string) => ["negotiations", "thread", id] as const,
  settings: ["negotiations", "settings"] as const,
  runs: ["negotiations", "runs"] as const,
  guide: ["negotiations", "guide"] as const,
  floors: (variantId: string) => ["negotiations", "floors", variantId] as const,
  users: ["negotiations", "users"] as const,
}

export type ListFilters = {
  status?: string
  waiting?: boolean
  q?: string
  customer_id?: string
  product_id?: string
  limit?: number
  offset?: number
}

export function useThreads(filters: ListFilters, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.list(filters),
    queryFn: () => get<ListResponse>("", filters),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
}

export const useStats = () =>
  useQuery({ queryKey: keys.stats, queryFn: () => get<{ stats: Stats; demo: boolean }>("/stats") })
export const useThread = (id: string) =>
  useQuery({ queryKey: keys.thread(id), queryFn: () => get<ThreadDetail>(`/${id}`) })
export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => get<SettingsResponse>("/settings"), retry: false })
export const useRuns = () => useQuery({ queryKey: keys.runs, queryFn: () => get<{ runs: Run[] }>("/runs") })
export const useGuide = () => useQuery({ queryKey: keys.guide, queryFn: () => get<{ steps: GuideStep[] }>("/guide") })

/** Admin users, for the assignee picker and author names. */
export const useUsers = () =>
  useQuery({
    queryKey: keys.users,
    queryFn: () =>
      sdk.client.fetch<{
        users: Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>
      }>("/admin/users", { query: { limit: 200, fields: "id,email,first_name,last_name" } }),
    staleTime: 5 * 60_000,
  })

/** A move on a thread; on success the thread page and lists refresh. */
export function useThreadAction<B>(id: string, path: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: B) => post<ThreadDetail>(`/${id}/${path}`, body),
    onSuccess: (data) => {
      client.setQueryData(keys.thread(id), data)
      client.invalidateQueries({ queryKey: ["negotiations", "list"] })
      client.invalidateQueries({ queryKey: keys.stats })
    },
    onError: () => client.invalidateQueries({ queryKey: keys.thread(id) }),
  })
}

export const previewOffer = (id: string, price: PriceInput) =>
  post<{ offer: Offer; floors: FloorCheck; modes: OfferMode[] }>(`/${id}/preview`, { price })

export const draftOrderStep = <T>(id: string, step: "plan" | "dry-run" | "commit", body: unknown) =>
  post<T>(`/${id}/draft-order/${step}`, body)

export function useSaveSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (settings: Settings) => post<SettingsResponse>("/settings", settings),
    onSuccess: (data) => {
      client.setQueryData(keys.settings, data)
      client.invalidateQueries({ queryKey: keys.guide })
    },
  })
}

export function useExpireNow() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => post<{ lapsed: number; expired: number }>("/expire"),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useResetDemo() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => post<{ ok: true }>("/demo/reset"),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  })
}

export const useFloors = (variantId: string) =>
  useQuery({
    queryKey: keys.floors(variantId),
    queryFn: () => get<{ floors: Array<{ currency_code: string; amount: number }> }>(`/variants/${variantId}/floors`),
    retry: false,
  })

export function useSaveFloors(variantId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (floors: Array<{ currency_code: string; amount: number }>) =>
      post<{ floors: Array<{ currency_code: string; amount: number }> }>(`/variants/${variantId}/floors`, { floors }),
    onSuccess: (data) => client.setQueryData(keys.floors(variantId), data),
  })
}

/** The API error body behind a js-sdk FetchError, when there is one. */
export function apiError(error: unknown): ApiError & { negotiation?: Thread } {
  if (error instanceof NegotiationsApiError) return error.body
  return { message: (error as Error)?.message }
}
