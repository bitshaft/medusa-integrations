import { BUILT_IN_TYPES } from "../types"
import { buildDemoMessages, DEMO_KEY_PREFIX, type DemoOrder } from "../demo-data"

const NOW = new Date("2026-11-19T10:00:00.000Z")

const orders: DemoOrder[] = Array.from({ length: 8 }, (_, i) => ({
  id: `order_${i + 1}`,
  display_id: 1001 + i,
  email: `buyer${i + 1}@example.com`,
  customer_id: `cus_${i + 1}`,
  total: "249,00 zł",
  locale: "pl",
  real: true,
}))

function build(overrides: Partial<Parameters<typeof buildDemoMessages>[0]> = {}) {
  let n = 0
  return buildDemoMessages({
    now: NOW,
    orders,
    customers: [
      { id: "cus_1", email: "buyer1@example.com", locale: "pl" },
      { id: "cus_2", email: "buyer2@example.com", locale: "pl" },
    ],
    team: ["team@example.com"],
    storeName: "Sklep Demo",
    defaultLocale: "pl",
    id: (prefix) => `${prefix}_${++n}`,
    ...overrides,
  })
}

describe("demo send log", () => {
  const messages = build()

  it("covers every built-in email type and every status", () => {
    expect(new Set(messages.map((m) => m.type))).toEqual(new Set(BUILT_IN_TYPES.map((t) => t.type)))
    expect(new Set(messages.map((m) => m.status))).toEqual(new Set(["sent", "failed", "pending", "demo"]))
  })

  it("marks every row as demo data, uniquely, and never lets the retry job send one", () => {
    expect(messages.every((m) => m.dedupe_key.startsWith(DEMO_KEY_PREFIX))).toBe(true)
    expect(new Set(messages.map((m) => m.dedupe_key)).size).toBe(messages.length)
    expect(messages.every((m) => !m.retryable && m.next_retry_at === null)).toBe(true)
  })

  it("spreads over the last month, never in the future, oldest first", () => {
    const times = messages.map((m) => m.created_at.getTime())
    expect(Math.min(...times)).toBeGreaterThan(NOW.getTime() - 31 * 86_400_000)
    expect(Math.max(...times)).toBeLessThanOrEqual(NOW.getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it("renders subjects from the default copy and shows why failures failed", () => {
    const confirmation = messages.find((m) => m.type === "order-confirmation" && m.status === "sent")!
    expect(confirmation.subject).toMatch(/^Potwierdzenie zamówienia nr #10\d\d$/)
    expect(messages.find((m) => m.type === "welcome")?.subject).toBe("Witamy w Sklep Demo")
    for (const failed of messages.filter((m) => m.status === "failed")) {
      expect(failed.error).toBeTruthy()
    }
  })

  it("includes a resend of a failed email, linked to the original", () => {
    const resend = messages.find((m) => m.trigger_type === "resend")!
    const original = messages.find((m) => m.id === resend.original_message_id)!
    expect(original.status).toBe("failed")
    expect(resend.status).toBe("sent")
  })

  it("keeps secrets out: account emails with a code or link store no input", () => {
    for (const m of messages.filter((m) => ["password-reset", "email-verification"].includes(m.type))) {
      expect(m.input).toBeNull()
    }
  })

  it("only makes emails of real orders resendable", () => {
    const sample = build({ orders: orders.map((o) => ({ ...o, real: false })) })
    expect(sample.filter((m) => m.order_id).every((m) => m.input === null)).toBe(true)
    expect(messages.some((m) => m.type === "order-confirmation" && m.input?.order_id)).toBe(true)
  })

  it("works without customers or team recipients", () => {
    const bare = build({ customers: [], team: [] })
    expect(bare.length).toBeGreaterThan(0)
    expect(bare.some((m) => m.type === "team-new-order")).toBe(true)
  })
})
