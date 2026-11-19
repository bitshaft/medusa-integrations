import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { backendUrl, sdk } from "./kit/sdk"

/* Types (mirroring the admin API). Amounts are integers in minor units. -- */

export type Totals = Record<string, number>
export type MethodGroup = "card" | "blik" | "p24" | "apple_pay" | "google_pay" | "other"
export type Completeness = { partial: boolean; missed: string[]; truncated: string[] }
export type OrderRef = { id: string; display_id: number | null }

export type Status = {
  enabled: boolean
  disabled_reason: string | null
  demo: boolean
  version: string | null
  key: {
    kind: "secret" | "restricted" | "publishable" | "unknown"
    mode: "live" | "test" | "unknown"
    last4: string
  } | null
  expected_mode: { mode: "live" | "test"; source: "option" | "node_env" }
  options: {
    hasKey: boolean
    providerId: string
    backendUrl?: string
    storefrontDomains: string[]
    cacheSeconds: number
    mode?: "live" | "test"
    orphanGraceMinutes: number
  }
}

export type Overview = Completeness & {
  demo: boolean
  days: number
  turnover: Totals
  fees: Totals
  net: Totals
  refunds: Totals
  success: { succeeded: number; attempts: number; per_mille: number | null }
  disputes: { open: number; amounts: Totals }
  balance: { available: Totals; pending: Totals } | null
  next_payout: { id: string; amount: number; currency: string; arrival_date: number; status: string } | null
  methods: Array<{ method: MethodGroup; attempts: number; succeeded: number; amounts: Totals }>
}

export type Payment = {
  id: string
  created: number
  status: string
  amount: number
  currency: string
  method: MethodGroup
  method_label: string
  decline: { code: string | null; message: string | null } | null
  risk_level: string | null
  risk_score: number | null
  three_d_secure: string | null
  fee: number | null
  net: number | null
  order: OrderRef | null
  orphan: boolean
  dashboard_url: string
}

export type Payout = {
  id: string
  amount: number
  currency: string
  arrival_date: number
  created: number
  status: string
  automatic: boolean
  dashboard_url: string
}

export type PayoutItem = {
  id: string
  type: string
  created: number
  amount: number
  fee: number
  net: number
  currency: string
  description: string | null
  payment_intent: string | null
  order: OrderRef | null
  missing_order: boolean
  dashboard_url: string | null
}

export type Dispute = {
  id: string
  amount: number
  currency: string
  reason: string
  status: string
  created: number
  due_by: number | null
  days_left: number | null
  urgent: boolean
  payment_intent: string | null
  order: OrderRef | null
  dashboard_url: string
}

export type Check = {
  id: "provider" | "api_key" | "account" | "payment_methods" | "webhook" | "domains" | "capture" | "mode"
  verdict: "ok" | "warn" | "error"
  code: string
  params?: Record<string, string | number>
}

export type OrderPayment = Payment & {
  amount_received: number
  capture_method: string
  three_d_secure_version: string | null
  exchange_rate: number | null
  settlement: { amount: number; fee: number; net: number; currency: string; available_on: number } | null
  refunds: Array<{
    id: string
    amount: number
    currency: string
    status: string
    reason: string | null
    created: number
  }>
  disputes: Dispute[]
  payout: {
    id: string
    amount: number
    currency: string
    arrival_date: number
    status: string
    dashboard_url: string
  } | null
}

/* Queries ------------------------------------------------------------------ */

const get = <T>(path: string, query?: Record<string, unknown>) =>
  sdk.client.fetch<T>(`/admin/stripe${path}`, {
    query: Object.fromEntries(
      Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== "" && v !== false)
    ),
  })

export const keys = { all: ["stripe"] as const }

/** `refresh` asks the server to read Stripe again instead of using its cache. */
export type Refreshable = { refresh?: boolean }

export const useStatus = () => useQuery({ queryKey: ["stripe", "status"], queryFn: () => get<Status>("/status") })

export const useOverview = (days: 7 | 30, enabled = true) =>
  useQuery({
    queryKey: ["stripe", "overview", days],
    queryFn: () => get<Overview>("/overview", { days }),
    enabled,
    placeholderData: keepPreviousData,
  })

export type PaymentFilters = { days: number; status?: string; method?: MethodGroup; currency?: string }

export const usePayments = (filters: PaymentFilters) =>
  useQuery({
    queryKey: ["stripe", "payments", filters],
    queryFn: () => get<Completeness & { demo: boolean; payments: Payment[] }>("/payments", filters),
    placeholderData: keepPreviousData,
  })

export const usePayouts = (days: number) =>
  useQuery({
    queryKey: ["stripe", "payouts", days],
    queryFn: () => get<Completeness & { demo: boolean; payouts: Payout[] }>("/payouts", { days }),
  })

export const usePayout = (id: string | null) =>
  useQuery({
    queryKey: ["stripe", "payout", id],
    queryFn: () => get<Completeness & { demo: boolean; payout: Payout; items: PayoutItem[] }>(`/payouts/${id}`),
    enabled: Boolean(id),
  })

export const useDisputes = (enabled = true) =>
  useQuery({
    queryKey: ["stripe", "disputes"],
    queryFn: () => get<Completeness & { demo: boolean; disputes: Dispute[] }>("/disputes"),
    enabled,
  })

export const useChecks = () =>
  useQuery({
    queryKey: ["stripe", "checks"],
    queryFn: () => get<{ demo: boolean; partial: boolean; missed: string[]; checks: Check[] }>("/checks"),
  })

/** `version` changes when Medusa captures or refunds, so the widget reads Stripe again. */
export const useOrderPayments = (orderId: string, version: string) =>
  useQuery({
    queryKey: ["stripe", "order", orderId, version],
    queryFn: () => get<Completeness & { demo: boolean; payments: OrderPayment[] }>(`/orders/${orderId}`),
  })

/** Forgets the server cache, then reloads every Stripe view. */
export function useRefresh() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => sdk.client.fetch<{ cleared: number }>("/admin/stripe/refresh", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export const csvUrl = (path: string, query: Record<string, unknown> = {}) => {
  const params = new URLSearchParams({ format: "csv" })
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v))
  return backendUrl(`/admin/stripe${path}?${params}`)
}
