import { anonymousEmail, anonymizedAddress, customerUpdate, orderPlan } from "../anonymize"
import { toCsv } from "../csv"
import { addMonths, formatDate, formatMoney } from "../format"
import { ComplianceError } from "../messages"
import { canDo, daysLeft, deadlineFor, hashToken, isDueSoon, newToken, nextStatus, rateLimitWait } from "../requests"
import { DEFAULT_SETTINGS, readSettings, settingsSchema } from "../settings"
import { crc32, zip } from "../zip"

const scope = DEFAULT_SETTINGS.gdpr.anonymize
const now = new Date("2026-11-14T12:00:00Z")

describe("request lifecycle", () => {
  it("gives tokens that verify only by hash", () => {
    const { token, hash } = newToken()
    expect(token).toMatch(/^[\w-]{40,}$/)
    expect(hashToken(token)).toBe(hash)
    expect(hashToken(`${token}x`)).not.toBe(hash)
  })

  it("sets the deadline from verification and warns before it", () => {
    const deadline = deadlineFor(new Date("2026-11-01T10:00:00Z"), 30)
    expect(deadline.toISOString()).toBe("2026-12-01T10:00:00.000Z")
    expect(daysLeft(deadline, now)).toBe(17)
    expect(isDueSoon(deadline, now, 7)).toBe(false)
    expect(isDueSoon(deadline, new Date("2026-11-25T10:00:00Z"), 7)).toBe(true)
    expect(daysLeft(deadline, new Date("2026-12-03T10:00:00Z"))).toBe(-2)
  })

  it("allows actions by status and type", () => {
    expect(canDo("open", "accept", "erasure")).toBe(true)
    expect(canDo("open", "anonymize", "erasure")).toBe(false)
    expect(canDo("accepted", "anonymize", "erasure")).toBe(true)
    expect(canDo("accepted", "anonymize", "access")).toBe(false)
    expect(canDo("accepted", "export", "portability")).toBe(true)
    expect(canDo("accepted", "export", "erasure")).toBe(false)
    expect(canDo("completed", "reject", "access")).toBe(false)
    expect(canDo("rejected", "note", "access")).toBe(true)
    expect(nextStatus("open", "accept")).toBe("accepted")
    expect(nextStatus("accepted", "note")).toBe("accepted")
  })
})

describe("rateLimitWait", () => {
  const limits = { per_email: 2, per_ip: 3, window_minutes: 60 }
  const row = (minutesAgo: number, email: string | null, ip_hash: string | null) => ({
    created_at: new Date(now.getTime() - minutesAgo * 60_000),
    email,
    ip_hash,
  })

  it("lets requests through under the limit", () => {
    expect(rateLimitWait([row(5, "a@x.pl", "ip1")], { email: "a@x.pl", ip_hash: "ip1" }, limits, now)).toBe(0)
  })

  it("stops a third request from one e-mail and says how long to wait", () => {
    const recent = [row(50, "a@x.pl", "ip1"), row(10, "a@x.pl", "ip2")]
    expect(rateLimitWait(recent, { email: "a@x.pl", ip_hash: "ip3" }, limits, now)).toBe(10)
  })

  it("limits by IP across e-mails and forgets requests outside the window", () => {
    const recent = [row(30, "a@x.pl", "ip1"), row(20, "b@x.pl", "ip1"), row(10, "c@x.pl", "ip1"), row(90, "d", "ip9")]
    expect(rateLimitWait(recent, { email: "z@x.pl", ip_hash: "ip1" }, limits, now)).toBe(30)
    expect(rateLimitWait(recent, { email: "d", ip_hash: "ip9" }, limits, now)).toBe(0)
  })
})

describe("anonymisation plan", () => {
  it("makes a unique placeholder e-mail so the person can sign up again", () => {
    expect(anonymousEmail("cus_01ABC")).toBe("anon-cus01abc@invalid")
    expect(customerUpdate("cus_01ABC", scope)).toMatchObject({
      email: "anon-cus01abc@invalid",
      first_name: "[anonimizacja]",
      phone: null,
      has_account: false,
    })
  })

  it("replaces every personal field of an address and keeps the country", () => {
    const address = anonymizedAddress("[x]")
    expect(address).toMatchObject({ first_name: "[x]", address_1: "[x]", postal_code: "[x]", phone: null })
    expect(address).not.toHaveProperty("country_code")
  })

  it("keeps the billing address until the retention period ends", () => {
    const recent = orderPlan(new Date("2025-01-10T00:00:00Z"), scope, now)
    expect(recent).toMatchObject({ email: true, phone: true, shipping: true, billing: false })
    expect(recent.billing_purge_after?.toISOString()).toBe("2031-01-10T00:00:00.000Z")

    const old = orderPlan(new Date("2019-01-10T00:00:00Z"), scope, now)
    expect(old).toMatchObject({ billing: true, billing_purge_after: null })
  })

  it("follows the scope settings", () => {
    const custom = settingsSchema.parse({
      gdpr: { anonymize: { order_email: false, order_billing_address: true, billing_retention_months: 0 } },
    }).gdpr.anonymize
    expect(orderPlan(new Date("2026-01-01"), custom, now)).toMatchObject({
      email: false,
      billing: true,
      billing_purge_after: null,
    })
    const forever = settingsSchema.parse({ gdpr: { anonymize: { billing_retention_months: 0 } } }).gdpr.anonymize
    expect(orderPlan(new Date("2010-01-01"), forever, now)).toMatchObject({ billing: false, billing_purge_after: null })
  })
})

describe("settings", () => {
  it("has safe defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      modules: { gpsr: true, gdpr: true, omnibus: true },
      gdpr: { response_days: 30, warn_days: 7 },
      omnibus: { period_days: 30, automatic_promotions: true, code_promotions: false },
    })
    expect(DEFAULT_SETTINGS.gdpr.request_notice).toBe("[DO UZUPEŁNIENIA PRZEZ PRAWNIKA]")
  })

  it("falls back to defaults for broken stored data", () => {
    expect(readSettings({ gdpr: { response_days: -5 } })).toEqual(DEFAULT_SETTINGS)
    // Demo mode moved to the plugin options: an old stored value is dropped.
    expect(readSettings({ demo: true })).not.toHaveProperty("demo")
  })
})

describe("formatting, errors and files", () => {
  it("formats money and dates for Polish", () => {
    expect(formatMoney(255, "pln", "pl").replace(/\s/g, " ")).toBe("255,00 zł")
    expect(formatDate("2026-11-13T12:00:00Z", "pl")).toBe("13 lis 2026")
    expect(formatDate("2026-11-13T12:00:00Z", "en")).toBe("13 Nov 2026")
  })

  it("adds calendar months", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z")
  })

  it("explains refusals in both languages", () => {
    const error = new ComplianceError("rate_limited", { minutes: 12 })
    expect(error.message).toBe(
      "Wysłano za dużo zgłoszeń. Spróbuj ponownie za 12 min. / Too many requests. Try again in 12 min."
    )
    expect(error.localized("en")).toBe("Too many requests. Try again in 12 min.")
  })

  it("writes CSV for Excel and protects against formulas", () => {
    expect(toCsv(["a", "b"], [["=SUM(A1)", 1.5]])).toBe("﻿a;b\r\n'=SUM(A1);1,5\r\n")
  })

  it("builds a valid stored ZIP", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926)
    const archive = zip([
      { name: "a.json", content: "{}" },
      { name: "zgody.csv", content: "x" },
    ])
    expect(archive.readUInt32LE(0)).toBe(0x04034b50)
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50)
    expect(archive.readUInt16LE(archive.length - 12)).toBe(2)
  })
})
