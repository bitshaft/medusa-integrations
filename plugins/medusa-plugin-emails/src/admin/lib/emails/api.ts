import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { sdk } from "./kit/sdk"

/* Types (mirroring the admin API responses) ------------------------------- */

/** A store language code, e.g. `pl-PL`. */
export type EmailLocale = string
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
      /** The original language; texts fall back to it. */
      default_locale: EmailLocale
      /** The base first, then the store's other languages (only the base without the Translation module). */
      locales: EmailLocale[]
      translation_enabled: boolean
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
  /** Untranslated fields, summed over the store's languages. */
  missing_translations: number
}

export type CopyField = {
  value: string
  /** Default in this language; empty for a language without text of its own. */
  default: string
  edited: boolean
  /** The base language's text, sent when this language has none. */
  original: string
}

export type EmailTypeDetail = (EmailTypeSummary | { type: "common" }) & {
  base_locale: EmailLocale
  locales: EmailLocale[]
  translation_enabled: boolean
  fields: Array<{ key: string; multiline: boolean }>
  variables: string[] | null
  copy: Record<EmailLocale, Record<string, CopyField>>
  /** Untranslated fields per language, as saved. */
  missing: Record<EmailLocale, number>
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
    queryFn: () =>
      sdk.client.fetch<{
        types: EmailTypeSummary[]
        common_edited: boolean
        common_missing_translations: number
      }>("/admin/emails/types"),
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
  input: { locale: EmailLocale; order_id?: string; copy?: CopyDraft; theme?: EmailTheme },
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
      sdk.client.fetch<SendOutcome>(`/admin/emails/types/${type}/send-test`, { method: "POST", body }),
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

/* Appearance and rollout guide --------------------------------------------- */

export type ColorKey = "primary" | "primaryText" | "background" | "card" | "text" | "muted" | "border"
export type FontKey = "system" | "helvetica" | "verdana" | "trebuchet" | "georgia" | "mono"
export type ButtonShape = "square" | "rounded" | "pill"
export type CardShape = "square" | "rounded" | "soft"
export type Alignment = "center" | "left"

/** What the admin saved on the Appearance tab; missing fields follow the plugin options. */
export type EmailTheme = {
  colors?: Partial<Record<ColorKey, string>>
  font?: FontKey
  button_shape?: ButtonShape
  card_shape?: CardShape
  header_align?: Alignment
  logo_url?: string | null
  logo_width?: number
}

export type ThemeResponse = {
  theme: EmailTheme
  defaults: {
    colors: Record<ColorKey, string>
    font: FontKey
    button_shape: ButtonShape
    card_shape: CardShape
    header_align: Alignment
    logo_url: string | null
    logo_width: number
  }
}

export function useEmailTheme(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "theme"],
    queryFn: () => sdk.client.fetch<ThemeResponse>("/admin/emails/theme"),
    enabled,
  })
}

export function useSaveEmailTheme() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (theme: EmailTheme | null) =>
      sdk.client.fetch<ThemeResponse>("/admin/emails/theme", { method: "POST", body: { theme } }),
    onSuccess: (data) => {
      queryClient.setQueryData([KEY, "theme"], data)
      queryClient.invalidateQueries({ queryKey: [KEY, "preview"] })
      queryClient.invalidateQueries({ queryKey: [KEY, "guide"] })
    },
  })
}

export type GuideStep = import("./kit/setup").SetupStep

export function useEmailsGuide() {
  return useQuery({
    queryKey: [KEY, "guide"],
    queryFn: () => sdk.client.fetch<{ steps: GuideStep[] }>("/admin/emails/guide"),
  })
}

/** "Restore test data" (demo mode only): replaces the demo rows of the send history. */
export function useResetEmailsDemo() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ messages: number; orders: number; customers: number }>("/admin/emails/demo/reset", {
        method: "POST",
      }),
    onSuccess: () => invalidate(),
  })
}
