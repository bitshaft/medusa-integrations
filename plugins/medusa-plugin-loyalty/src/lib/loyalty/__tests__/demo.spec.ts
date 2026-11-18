import { buildDemoData, DEMO_PROFILES, demoSettings } from "../demo"
import { addMonths, expiresAt, tierFor } from "../points"
import { DEFAULT_SETTINGS, settingsSchema, sortedTiers } from "../settings"
import { spendSince } from "../spend"
import { ENTRY_REASONS, REDEMPTION_STATUSES, REWARD_KINDS } from "../types"

const NOW = new Date("2026-11-18T10:00:00.000Z")
const DAY = 86_400_000

function build(customers = DEMO_PROFILES, gift: string | null = "variant_gift") {
  let n = 0
  return buildDemoData({
    now: NOW,
    customers: Array.from({ length: customers }, (_, i) => `cus_${i + 1}`),
    giftVariantId: gift,
    currency: "pln",
    current: settingsSchema.parse({ currency_code: "pln", terms_url: "https://shop.example/terms" }),
    actorId: "user_admin",
    id: (prefix) => `${prefix}_${String(++n).padStart(4, "0")}`,
  })
}

describe("demo data", () => {
  const data = build()

  it("switches every rule on and keeps the store's own settings", () => {
    expect(settingsSchema.safeParse(data.settings).success).toBe(true)
    const { actions, tiers, expiry } = data.settings
    expect([actions.signup, actions.first_order, actions.birthday, actions.newsletter].every((a) => a.enabled)).toBe(
      true
    )
    expect(tiers.levels.map((t) => t.id)).toEqual(["bronze", "silver", "gold"])
    expect(expiry.enabled).toBe(true)
    expect(data.settings.terms_url).toBe("https://shop.example/terms")
    expect(data.settings.currency_code).toBe("pln")
    expect(demoSettings(DEFAULT_SETTINGS).currency_code).toBeNull()
  })

  it("has a reward of every kind, a tier-only one and a switched-off one", () => {
    expect(new Set(data.rewards.map((r) => r.kind))).toEqual(new Set(REWARD_KINDS))
    expect(data.rewards.some((r) => r.min_tier_id === "silver")).toBe(true)
    expect(data.rewards.some((r) => !r.active)).toBe(true)
    expect(build(DEMO_PROFILES, null).rewards.some((r) => r.kind === "gift")).toBe(false)
  })

  it("uses every entry reason and every redemption status", () => {
    expect(new Set(data.entries.map((e) => e.reason))).toEqual(new Set(ENTRY_REASONS))
    expect(new Set(data.redemptions.map((r) => r.status))).toEqual(new Set(REDEMPTION_STATUSES))
  })

  it("keeps the ledger consistent: unique keys, balances that add up and never go below zero", () => {
    expect(new Set(data.entries.map((e) => e.key)).size).toBe(data.entries.length)
    for (const account of data.accounts) {
      const entries = data.entries
        .filter((e) => e.account_id === account.id)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      let running = 0
      for (const entry of entries) {
        running += entry.points
        expect(running).toBeGreaterThanOrEqual(0)
        expect(entry.created_at.getTime()).toBeLessThanOrEqual(NOW.getTime())
      }
      expect(account.balance).toBe(running)
    }
  })

  it("puts customers in the tier the plugin itself would compute from their ledger", () => {
    const tiers = sortedTiers(data.settings)
    const since = addMonths(NOW, -data.settings.tiers.window_months)
    for (const account of data.accounts) {
      const spend = spendSince(data.entries.filter((e) => e.account_id === account.id) as never, since)
      expect(account.tier_id).toBe(tierFor(spend, tiers)?.id ?? null)
    }
    expect(new Set(data.accounts.map((a) => a.tier_id))).toEqual(new Set(["bronze", "silver", "gold"]))
    // Every tier reached with a bonus paid it once.
    for (const entry of data.entries.filter((e) => e.reason === "tier_bonus")) {
      expect(entry.points).toBeGreaterThan(0)
    }
    expect(data.tier_changes.length).toBeGreaterThan(data.accounts.length)
  })

  it("has points expiring within 30 days, an upcoming birthday and a manual correction by the admin", () => {
    const soon = NOW.getTime() + 30 * DAY
    const expiring = data.accounts.filter((a) => {
      const at = expiresAt(a.last_activity_at ?? a.created_at, data.settings.expiry)
      return a.balance > 0 && at && at.getTime() <= soon
    })
    expect(expiring.length).toBeGreaterThan(0)
    expect(data.accounts.some((a) => a.birthday?.match(/^--\d{2}-\d{2}$/))).toBe(true)
    expect(data.entries.find((e) => e.reason === "manual")).toMatchObject({
      actor_type: "admin",
      actor_id: "user_admin",
    })
  })

  it("uses the plugin's own entry keys so the real program never pays twice", () => {
    const signup = data.entries.find((e) => e.reason === "signup" && e.customer_id === "cus_1")
    expect(signup?.key).toBe("signup:cus_1")
    expect(data.entries.find((e) => e.reason === "first_order" && e.customer_id === "cus_1")?.key).toBe(
      "first_order:cus_1"
    )
    const earn = data.entries.find((e) => e.reason === "earn")!
    expect(earn.key).toBe(`order:${earn.order_id}:earn`)
  })

  it("makes do with fewer customers", () => {
    const small = build(2)
    expect(small.accounts).toHaveLength(2)
    expect(small.entries.every((e) => ["cus_1", "cus_2"].includes(e.customer_id))).toBe(true)
  })
})
