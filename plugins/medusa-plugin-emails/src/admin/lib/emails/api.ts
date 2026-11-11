import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

export type EmailLocale = "en" | "pl"
export type EmailAudience = "customer" | "account" | "team"

export type EmailsStatus =
  | { enabled: false; disabled_reason: string; version: string }
  | {
      enabled: true
      version: string
      demo: boolean
      from: string
      from_address: string
      reply_to: string | null
      channel: string
      default_locale: EmailLocale
      locales: EmailLocale[]
      store_name: string | null
      storefront_url: string | null
      admin_url: string | null
      max_attempts: number
    }

export type EmailsGeneralSettings = {
  team_recipients: string[]
  team_recipients_overridden: boolean
  default_team_recipients: string[]
  low_stock_threshold: number
  low_stock_threshold_overridden: boolean
  default_low_stock_threshold: number
}

export type EmailTypeSummary = {
  type: string
  audience: EmailAudience
  custom: boolean
  sensitive: boolean
  enabled: boolean
  default_enabled: boolean
  recipients: string[] | null
  edited: boolean
}

export type CopyField = { value: string; default: string; edited: boolean }

export type EmailTypeDetail = (EmailTypeSummary | { type: "common" }) & {
  fields: Array<{ key: string; multiline: boolean }>
  variables: string[] | null
  copy: Record<EmailLocale, Record<string, CopyField>>
  edited: boolean
}

export type CopyDraft = Partial<Record<EmailLocale, Record<string, string>>>

export type EmailPreview = {
  subject: string
  html: string
  text: string
  locale: EmailLocale
  to: string | null
  order: { id: string; display_id: string } | null
}

export type MessageStatus = "pending" | "sent" | "failed" | "demo"

export type EmailMessage = {
  id: string
  type: string
  locale: string
  recipient: string
  subject: string | null
  status: MessageStatus
  order_id: string | null
  customer_id: string | null
  trigger_type: string | null
  attempts: number
  retryable: boolean
  next_retry_at: string | null
  error: string | null
  original_message_id: string | null
  sent_at: string | null
  created_at: string
  resendable: boolean
}

export type SendOutcome = {
  status: "sent" | "failed" | "demo" | "duplicate" | "skipped"
  reason: string | null
  error: string | null
}

export type MessageFilters = {
  order_id?: string
  customer_id?: string
  type?: string
  status?: MessageStatus
  q?: string
  limit?: number
  offset?: number
}

/* Queries ----------------------------------------------------------------- */

const KEY = "emails"

export function useEmailsStatus() {
  return useQuery({
    queryKey: [KEY, "status"],
    queryFn: () => sdk.client.fetch<EmailsStatus>("/admin/emails/status"),
  })
}

export function useEmailsSettings(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "settings"],
    queryFn: () => sdk.client.fetch<{ settings: EmailsGeneralSettings }>("/admin/emails/settings"),
    enabled,
  })
}

export function useEmailTypes(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "types"],
    queryFn: () => sdk.client.fetch<{ types: EmailTypeSummary[]; common_edited: boolean }>("/admin/emails/types"),
    enabled,
  })
}

export function useEmailType(type: string | undefined) {
  return useQuery({
    queryKey: [KEY, "types", type],
    queryFn: () => sdk.client.fetch<{ email_type: EmailTypeDetail }>(`/admin/emails/types/${type}`),
    enabled: Boolean(type),
  })
}

export function useEmailPreview(
  type: string | undefined,
  input: { locale: EmailLocale; order_id?: string; copy?: CopyDraft },
  enabled: boolean
) {
  return useQuery({
    queryKey: [KEY, "preview", type, input],
    queryFn: () =>
      sdk.client.fetch<{ preview: EmailPreview }>(`/admin/emails/types/${type}/preview`, {
        method: "POST",
        body: input,
      }),
    enabled: Boolean(type) && enabled,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useEmailMessages(filters: MessageFilters, enabled = true) {
  return useQuery({
    queryKey: [KEY, "messages", filters],
    queryFn: () =>
      sdk.client.fetch<{ messages: EmailMessage[]; count: number; limit: number; offset: number }>(
        "/admin/emails/messages",
        { query: filters }
      ),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/** The newest orders, for the preview's order picker. */
export function useRecentOrders() {
  return useQuery({
    queryKey: [KEY, "recent-orders"],
    queryFn: () =>
      sdk.client.fetch<{ orders: Array<{ id: string; display_id: number; email: string | null }> }>("/admin/orders", {
        query: { limit: 10, order: "-created_at", fields: "id,display_id,email" },
      }),
  })
}

/* Mutations --------------------------------------------------------------- */

function useInvalidate() {
  const queryClient = useQueryClient()
  return (...parts: string[]) => queryClient.invalidateQueries({ queryKey: [KEY, ...parts] })
}

export function useUpdateEmailsSettings() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { team_recipients?: string[] | null; low_stock_threshold?: number | null }) =>
      sdk.client.fetch<{ settings: EmailsGeneralSettings }>("/admin/emails/settings", { method: "POST", body }),
    onSuccess: () => invalidate("settings"),
  })
}

export function useUpdateEmailType(type: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { enabled?: boolean; recipients?: string[] | null; copy?: CopyDraft }) =>
      sdk.client.fetch<{ email_type: EmailTypeDetail }>(`/admin/emails/types/${type}`, { method: "POST", body }),
    onSuccess: () => Promise.all([invalidate("types"), invalidate("preview")]),
  })
}

export function useResetEmailType(type: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (scope: "copy" | "all") =>
      sdk.client.fetch(`/admin/emails/types/${type}/reset`, { method: "POST", body: { confirm: type, scope } }),
    onSuccess: () => Promise.all([invalidate("types"), invalidate("preview")]),
  })
}

export function useResetAllEmails() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => sdk.client.fetch("/admin/emails/reset", { method: "POST", body: { confirm: "RESET" } }),
    onSuccess: () => invalidate(),
  })
}

export function useSendTestEmail(type: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { to: string; locale: EmailLocale; order_id?: string }) =>
      sdk.client.fetch<SendOutcome>(`/admin/emails/types/${type}/test`, { method: "POST", body }),
    onSuccess: () => invalidate("messages"),
  })
}

export function useResendEmail() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch<SendOutcome>(`/admin/emails/messages/${id}/resend`, { method: "POST" }),
    onSuccess: () => invalidate("messages"),
  })
}
