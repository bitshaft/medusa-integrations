import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

export type Status =
  "active" | "exempt" | "unregistered" | "inactive" | "valid" | "invalid" | "not_found" | "unverified"

export type Outcome =
  "active" | "exempt" | "unregistered" | "valid" | "invalid" | "found" | "inactive" | "not_found" | "unavailable"

export type Source = "mf" | "gus" | "vies"

export type SourceState = { outcome: Outcome; request_id: string | null; checked_at: string; error: string | null }

export type Company = {
  name?: string | null
  address?: string | null
  street?: string | null
  postal_code?: string | null
  city?: string | null
  regon?: string | null
  krs?: string | null
  legal_form?: string | null
  bank_accounts?: string[]
  registered_at?: string | null
}

export type Subject = {
  id: string
  number: string
  kind: "nip" | "eu_vat"
  country_code: string
  status: Status
  verified: boolean
  name: string | null
  address: string | null
  company: Company | null
  sources: Partial<Record<Source, SourceState>>
  bank_account_count: number
  customer_id: string | null
  checked_at: string | null
  stale: boolean
}

export type Check = {
  id: string
  number: string
  source: Source | "local"
  outcome: Outcome
  status: Status | null
  request_id: string | null
  error: string | null
  from_cache: boolean
  trigger_type: string | null
  name: string | null
  order_id: string | null
  customer_id: string | null
  checked_at: string
}

export type TaxIdProblem = "empty" | "unknown_country" | "format" | "checksum"

export type Verification = {
  tax_id: {
    input: string
    number: string
    kind: "nip" | "eu_vat"
    country_code: string
    valid: boolean
    problem?: TaxIdProblem
  }
  status: Status
  verified: boolean
  could_not_verify: boolean
  company: Company | null
  sources: Partial<Record<Source, SourceState>>
  checked_at: string | null
  stale: boolean
  from_cache: boolean
  subject_id: string | null
}

export type RecordView = {
  tax_id: {
    input: string
    location: string
    number: string
    kind: "nip" | "eu_vat"
    country_code: string
    valid_format: boolean
    problem: TaxIdProblem | null
  } | null
  subject: Subject | null
  checks: Check[]
}

export type SubjectFilter = "all" | "active" | "exempt" | "problem" | "stale"

export type WhitelistVatStatus =
  | { enabled: false; disabled_reason: string; version: string }
  | {
      enabled: true
      version: string
      registers: {
        mf: { enabled: boolean; environment: string; requests_today: number; daily_limit: number }
        gus: { enabled: boolean; environment: string }
        vies: { enabled: boolean; requester_vat_number: string | null }
      }
      counts: Record<SubjectFilter, number>
      options: {
        cache_ttl_hours: number
        timeout_ms: number
        default_country: string
        tax_id_keys: string[]
        verify_on_order_placed: boolean
        reject_on_completion: boolean
        reject_statuses: string[]
        store_route: boolean
        store_rate_limit_per_minute: number
      }
    }

export type BankAccountResult = {
  assigned: boolean | null
  problem: "invalid_nip" | "invalid_account" | "unavailable" | null
  error: string | null
  request_id: string | null
  checked_at: string
}

/* Queries ----------------------------------------------------------------- */

const KEY = "whitelist-vat"
const BASE = "/admin/whitelist-vat"

export function useWhitelistVatStatus() {
  return useQuery({
    queryKey: [KEY, "status"],
    queryFn: () => sdk.client.fetch<WhitelistVatStatus>(`${BASE}/status`),
  })
}

export function useSubjects(
  params: { q?: string; filter: SubjectFilter; limit: number; offset: number },
  enabled: boolean
) {
  return useQuery({
    queryKey: [KEY, "subjects", params],
    queryFn: () =>
      sdk.client.fetch<{ subjects: Subject[]; count: number }>(`${BASE}/subjects`, {
        query: { ...params, q: params.q || undefined },
      }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useChecks(params: { number?: string; limit: number; offset: number }, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "checks", params],
    queryFn: () => sdk.client.fetch<{ checks: Check[]; count: number }>(`${BASE}/checks`, { query: params }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useRecord(kind: "orders" | "customers", id: string, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, kind, id],
    queryFn: () => sdk.client.fetch<RecordView>(`${BASE}/${kind}/${id}`),
    enabled,
  })
}

/* Mutations --------------------------------------------------------------- */

function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [KEY] })
}

export function useVerifyNumber() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (body: { number: string; country_code?: string; force?: boolean }) =>
      sdk.client.fetch<{ verification: Verification; subject: Subject | null }>(`${BASE}/verify`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  })
}

export function useRefreshSubject() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch<{ verification: Verification; subject: Subject | null }>(`${BASE}/subjects/${id}/refresh`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  })
}

export function useVerifyRecord(kind: "orders" | "customers", id: string) {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<RecordView & { verification: Verification | null }>(`${BASE}/${kind}/${id}/verify`, {
        method: "POST",
        body: { force: true },
      }),
    onSuccess: invalidate,
  })
}

export function useCheckBankAccount() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (body: { nip: string; account: string }) =>
      sdk.client.fetch<BankAccountResult>(`${BASE}/bank-account`, { method: "POST", body }),
    onSuccess: invalidate,
  })
}
