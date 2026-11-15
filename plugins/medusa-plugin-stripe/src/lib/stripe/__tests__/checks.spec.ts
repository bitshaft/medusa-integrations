import {
  checkAccount,
  checkCapture,
  checkDomains,
  checkKey,
  checkMode,
  checkPaymentMethods,
  checkProvider,
  checkWebhook,
  expectedMode,
  type Probe,
  webhookUrl,
} from "../checks"
import { describeKey } from "../key"
import { providerCaptureOption } from "../server/checks"

const ok = <T>(value: T): Probe<T> => ({ ok: true, value })
const denied: Probe<never> = { ok: false, reason: "no_permission" }
const down: Probe<never> = { ok: false, reason: "unavailable" }
const v = (r: { verdict: string; code: string }) => `${r.verdict}:${r.code}`

describe("health checks", () => {
  it("provider", () => {
    expect(v(checkProvider(["pp_system_default", "pp_stripe_stripe", "pp_stripe-blik_stripe"], "stripe"))).toBe(
      "ok:registered"
    )
    expect(v(checkProvider(["pp_stripe_main"], "stripe"))).toBe("warn:other_id")
    expect(v(checkProvider(["pp_system_default"], "stripe"))).toBe("error:missing")
  })

  it("api key", () => {
    expect(v(checkKey(describeKey("rk_live_abcdefgh1234"), ok({})))).toBe("ok:restricted")
    expect(v(checkKey(describeKey("sk_live_abcdefgh1234"), ok({})))).toBe("warn:full_key")
    expect(v(checkKey(describeKey("rk_live_abcdefgh1234"), denied))).toBe("warn:no_permission")
    expect(v(checkKey(null, null))).toBe("error:missing")
    expect(v(checkKey(describeKey("pk_live_abcdefgh1234"), null))).toBe("error:publishable")
    expect(v(checkKey(describeKey("rk_live_abcdefgh1234"), { ok: false, reason: "invalid_key" }))).toBe(
      "error:invalid_key"
    )
  })

  it("account", () => {
    expect(v(checkAccount(ok({ charges_enabled: true, payouts_enabled: true, details_submitted: true })))).toBe(
      "ok:active"
    )
    expect(v(checkAccount(ok({ charges_enabled: true, payouts_enabled: false })))).toBe("warn:payouts_disabled")
    expect(v(checkAccount(denied))).toBe("warn:no_permission")
    expect(v(checkAccount(ok({ charges_enabled: false, payouts_enabled: true })))).toBe("error:charges_disabled")
  })

  it("payment methods", () => {
    const on = { available: true, display_preference: { value: "on" } }
    const off = { available: true, display_preference: { value: "off" } }
    const config = (overrides = {}) => ({
      is_default: true,
      active: true,
      card: on,
      blik: on,
      p24: on,
      apple_pay: on,
      google_pay: on,
      ...overrides,
    })
    expect(v(checkPaymentMethods(ok([config()])))).toBe("ok:all_on")
    const some = checkPaymentMethods(ok([config({ blik: off, google_pay: { available: false } })]))
    expect(v(some)).toBe("warn:some_off")
    expect(some.params).toEqual({ off: "blik, google_pay" })
    expect(v(checkPaymentMethods(ok([config({ card: off })])))).toBe("error:cards_off")
    expect(v(checkPaymentMethods(denied))).toBe("warn:no_permission")
  })

  it("webhook", () => {
    const url = webhookUrl("https://api.sklep.pl/", "stripe")!
    expect(url).toBe("https://api.sklep.pl/hooks/payment/stripe_stripe")
    const endpoint = {
      url,
      status: "enabled",
      enabled_events: [
        "payment_intent.succeeded",
        "payment_intent.amount_capturable_updated",
        "payment_intent.payment_failed",
      ],
    }
    expect(v(checkWebhook(url, ok([endpoint]), ok(0)))).toBe("ok:configured")
    expect(v(checkWebhook(url, ok([{ ...endpoint, enabled_events: ["*"] }]), ok(0)))).toBe("ok:configured")
    expect(v(checkWebhook(url, ok([endpoint]), ok(4)))).toBe("warn:failed_deliveries")
    expect(v(checkWebhook(url, ok([{ ...endpoint, enabled_events: ["payment_intent.succeeded"] }]), ok(0)))).toBe(
      "warn:events_missing"
    )
    expect(v(checkWebhook(null, ok([]), null))).toBe("warn:no_backend_url")
    expect(v(checkWebhook(url, ok([{ ...endpoint, url: "https://other.pl/hooks" }]), ok(0)))).toBe("error:missing")
    expect(v(checkWebhook(url, ok([{ ...endpoint, status: "disabled" }]), ok(0)))).toBe("error:disabled")
    expect(v(checkWebhook(url, down, null))).toBe("error:unavailable")
  })

  it("domains", () => {
    const active = {
      domain_name: "sklep.pl",
      enabled: true,
      apple_pay: { status: "active" },
      google_pay: { status: "active" },
    }
    expect(v(checkDomains(["sklep.pl"], ok([active])))).toBe("ok:registered")
    expect(v(checkDomains(["sklep.pl"], ok([{ ...active, apple_pay: { status: "inactive" } }])))).toBe("warn:inactive")
    expect(v(checkDomains([], null))).toBe("warn:no_domains")
    expect(v(checkDomains(["sklep.pl", "www.sklep.pl"], ok([active])))).toBe("error:missing")
  })

  it("capture mode", () => {
    const intents = (...modes: string[]) => ok(modes.map((capture_method) => ({ capture_method })))
    expect(v(checkCapture(true, intents("automatic", "automatic_async")))).toBe("ok:matches")
    expect(v(checkCapture(false, intents("manual", "automatic")))).toBe("warn:mismatch")
    expect(v(checkCapture(null, intents()))).toBe("warn:unknown_config")
    expect(v(checkCapture(true, denied))).toBe("warn:no_permission")
    expect(v(checkCapture(true, down))).toBe("error:unavailable")
  })

  it("reads the capture option of the official provider from medusa-config", () => {
    const config = {
      modules: {
        payment: {
          resolve: "@medusajs/medusa/payment",
          options: {
            providers: [{ resolve: "@medusajs/medusa/payment-stripe", id: "stripe", options: { capture: true } }],
          },
        },
      },
    }
    expect(providerCaptureOption(config, "stripe")).toBe(true)
    expect(providerCaptureOption(config, "other")).toBeNull()
    expect(providerCaptureOption({}, "stripe")).toBeNull()
  })

  it("mode: the option wins over NODE_ENV", () => {
    expect(expectedMode("test", "production")).toEqual({ mode: "test", source: "option" })
    expect(expectedMode(undefined, "production")).toEqual({ mode: "live", source: "node_env" })
    expect(expectedMode(undefined, "development")).toEqual({ mode: "test", source: "node_env" })
    expect(v(checkMode(describeKey("rk_test_abcdefgh1234"), expectedMode("test", "production")))).toBe("ok:matches")
    expect(v(checkMode(describeKey("rk_test_abcdefgh1234"), expectedMode(undefined, "production")))).toBe(
      "error:mismatch"
    )
    expect(v(checkMode(describeKey("whatever1234567"), expectedMode("live", undefined)))).toBe("warn:unknown_key")
  })
})
