import type { KeyInfo } from "./key"

export type Verdict = "ok" | "warn" | "error"

export const CHECK_IDS = [
  "provider",
  "api_key",
  "account",
  "payment_methods",
  "webhook",
  "domains",
  "capture",
  "mode",
] as const
export type CheckId = (typeof CHECK_IDS)[number]

/**
 * One check: a verdict and a `code` the admin turns into a message and a fix
 * (`stripe.checks.<id>.<code>` and `….<code>_fix`). `params` fill the texts.
 */
export type CheckResult = {
  id: CheckId
  verdict: Verdict
  code: string
  params?: Record<string, string | number>
}

type Row = Record<string, any>

/** A Stripe answer, or why there is none. */
export type Probe<T> =
  { ok: true; value: T } | { ok: false; reason: "no_permission" | "invalid_key" | "unavailable"; message?: string }

const result = (id: CheckId, verdict: Verdict, code: string, params?: CheckResult["params"]): CheckResult => ({
  id,
  verdict,
  code,
  ...(params ? { params } : {}),
})

const probeFailed = (id: CheckId, probe: Exclude<Probe<unknown>, { ok: true }>, permission: string): CheckResult =>
  probe.reason === "no_permission"
    ? result(id, "warn", "no_permission", { permission })
    : result(id, "error", probe.reason === "invalid_key" ? "invalid_key" : "unavailable")

/** The official provider is registered as `pp_stripe_<providerId>`. */
export function checkProvider(registered: string[], providerId: string): CheckResult {
  const expected = `pp_stripe_${providerId}`
  const stripe = registered.filter((id) => id.startsWith("pp_stripe"))
  const extras = stripe.filter((id) => id !== expected).join(", ")
  if (registered.includes(expected))
    return result("provider", "ok", "registered", { id: expected, extras: extras || "—" })
  if (stripe.length) return result("provider", "warn", "other_id", { id: expected, found: stripe.join(", ") })
  return result("provider", "error", "missing", { id: expected })
}

/** A restricted key is recommended; a full secret key works but can do anything. */
export function checkKey(info: KeyInfo | null, probe: Probe<unknown> | null): CheckResult {
  if (!info) return result("api_key", "error", "missing")
  if (info.kind === "publishable") return result("api_key", "error", "publishable")
  if (info.kind === "unknown") return result("api_key", "error", "unknown_format")
  if (probe && !probe.ok) {
    if (probe.reason === "invalid_key") return result("api_key", "error", "invalid_key", { last4: info.last4 })
    if (probe.reason === "no_permission") return result("api_key", "warn", "no_permission", { permission: "Balance" })
    return result("api_key", "error", "unavailable")
  }
  if (info.kind === "secret") return result("api_key", "warn", "full_key", { last4: info.last4, mode: info.mode })
  return result("api_key", "ok", "restricted", { last4: info.last4, mode: info.mode })
}

export function checkAccount(probe: Probe<Row>): CheckResult {
  if (!probe.ok) return probeFailed("account", probe, "Account")
  const account = probe.value
  if (!account.charges_enabled) return result("account", "error", "charges_disabled")
  if (!account.payouts_enabled) return result("account", "warn", "payouts_disabled")
  if (account.details_submitted === false) return result("account", "warn", "details_missing")
  return result("account", "ok", "active", {
    name: account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? account.id ?? "",
  })
}

export const EXPECTED_METHODS = ["card", "blik", "p24", "apple_pay", "google_pay"] as const

/** Methods on in the account's default payment method configuration. */
export function checkPaymentMethods(probe: Probe<Row[]>): CheckResult {
  if (!probe.ok) return probeFailed("payment_methods", probe, "Payment Method Configurations")
  const configs = probe.value.filter((c) => c.active !== false && !c.parent)
  const config = configs.find((c) => c.is_default) ?? configs[0]
  if (!config) return result("payment_methods", "warn", "no_configuration")
  const on = (m: string) => Boolean(config[m]?.available) && config[m]?.display_preference?.value === "on"
  const off = EXPECTED_METHODS.filter((m) => !on(m))
  if (off.includes("card")) return result("payment_methods", "error", "cards_off", { off: off.join(", ") })
  if (off.length) return result("payment_methods", "warn", "some_off", { off: off.join(", ") })
  return result("payment_methods", "ok", "all_on", { on: EXPECTED_METHODS.join(", ") })
}

/** Events the official provider reacts to. */
export const REQUIRED_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.amount_capturable_updated",
  "payment_intent.payment_failed",
]

export function webhookUrl(backendUrl: string | null, providerId: string): string | null {
  return backendUrl ? `${backendUrl.replace(/\/+$/, "")}/hooks/payment/stripe_${providerId}` : null
}

/** The provider's webhook points at this backend, listens to its events and had no failed deliveries in a day. */
export function checkWebhook(
  expectedUrl: string | null,
  endpoints: Probe<Row[]>,
  failedEvents: Probe<number> | null
): CheckResult {
  if (!expectedUrl) return result("webhook", "warn", "no_backend_url")
  if (!endpoints.ok) return probeFailed("webhook", endpoints, "Webhook Endpoints")
  const normalize = (url: string) => url.replace(/\/+$/, "").toLowerCase()
  const endpoint = endpoints.value.find((e) => normalize(String(e.url)) === normalize(expectedUrl))
  if (!endpoint) return result("webhook", "error", "missing", { url: expectedUrl })
  if (endpoint.status !== "enabled") return result("webhook", "error", "disabled", { url: expectedUrl })
  const events: string[] = endpoint.enabled_events ?? []
  const missing = events.includes("*") ? [] : REQUIRED_EVENTS.filter((e) => !events.includes(e))
  if (missing.length)
    return result("webhook", "warn", "events_missing", { url: expectedUrl, events: missing.join(", ") })
  if (failedEvents && !failedEvents.ok) return probeFailed("webhook", failedEvents, "Events")
  if (failedEvents?.ok && failedEvents.value > 0) {
    return result("webhook", "warn", "failed_deliveries", { url: expectedUrl, count: failedEvents.value })
  }
  return result("webhook", "ok", "configured", { url: expectedUrl })
}

/** Storefront domains registered for Apple Pay and Google Pay. */
export function checkDomains(domains: string[], registered: Probe<Row[]> | null): CheckResult {
  if (!domains.length) return result("domains", "warn", "no_domains")
  if (!registered) return result("domains", "error", "unavailable")
  if (!registered.ok) return probeFailed("domains", registered, "Payment Method Domains")
  const missing: string[] = []
  const inactive: string[] = []
  for (const domain of domains) {
    const entry = registered.value.find((d) => String(d.domain_name).toLowerCase() === domain)
    if (!entry) missing.push(domain)
    else if (!entry.enabled || entry.apple_pay?.status !== "active" || entry.google_pay?.status !== "active")
      inactive.push(domain)
  }
  if (missing.length) return result("domains", "error", "missing", { domains: missing.join(", ") })
  if (inactive.length) return result("domains", "warn", "inactive", { domains: inactive.join(", ") })
  return result("domains", "ok", "registered", { domains: domains.join(", ") })
}

/**
 * Recent PaymentIntents use the capture mode the provider is set to
 * (`capture: true` → automatic, otherwise manual).
 */
export function checkCapture(providerCapture: boolean | null, recent: Probe<Row[]>): CheckResult {
  if (providerCapture === null) return result("capture", "warn", "unknown_config")
  const expected = providerCapture ? "automatic" : "manual"
  if (!recent.ok) return probeFailed("capture", recent, "PaymentIntents")
  const modes = recent.value.map((i) => (String(i.capture_method).startsWith("automatic") ? "automatic" : "manual"))
  if (!modes.length) return result("capture", "ok", "no_payments", { expected })
  const other = modes.filter((m) => m !== expected).length
  if (other) return result("capture", "warn", "mismatch", { expected, other, total: modes.length })
  return result("capture", "ok", "matches", { expected, total: modes.length })
}

/** The key's mode is the expected one: the `mode` option, or live when NODE_ENV=production. */
export function expectedMode(
  option: "live" | "test" | undefined,
  nodeEnv: string | undefined
): { mode: "live" | "test"; source: "option" | "node_env" } {
  if (option) return { mode: option, source: "option" }
  return { mode: nodeEnv === "production" ? "live" : "test", source: "node_env" }
}

export function checkMode(
  info: KeyInfo | null,
  expected: { mode: "live" | "test"; source: "option" | "node_env" }
): CheckResult {
  if (!info || info.mode === "unknown") return result("mode", "warn", "unknown_key", { expected: expected.mode })
  if (info.mode !== expected.mode) {
    return result("mode", "error", "mismatch", { key: info.mode, expected: expected.mode, source: expected.source })
  }
  return result("mode", "ok", "matches", { mode: info.mode, source: expected.source })
}
