import { AdminReward } from "../api/validators"
import { ledgerCsv } from "../export"
import { spendSince } from "../spend"
import { customerTexts } from "../texts"

const plain = (text: string | null) => (text ?? "").replace(/ | /g, " ")

describe("spendSince: tier spend from the ledger", () => {
  const since = new Date("2026-01-01T00:00:00Z")
  const earn = (order_id: string, base: number, at = "2026-06-01T00:00:00Z") => ({
    reason: "earn",
    order_id,
    created_at: at,
    metadata: { base_total: base },
  })

  it("adds the base of orders paid in the window", () => {
    expect(spendSince([earn("o1", 300), earn("o2", 200)], since)).toBe(500)
  })

  it("leaves out orders paid before the window", () => {
    expect(spendSince([earn("o1", 300, "2025-12-31T23:59:59Z"), earn("o2", 200)], since)).toBe(200)
  })

  it("subtracts the value of returned units (the latest cumulative figure) and ignores canceled orders", () => {
    const entries = [
      earn("o1", 300),
      { reason: "return", order_id: "o1", created_at: "2026-06-02", metadata: { returned_base: 100 } },
      { reason: "return", order_id: "o1", created_at: "2026-06-03", metadata: { returned_base: 150 } },
      earn("o2", 200),
      { reason: "cancel", order_id: "o2", created_at: "2026-06-04", metadata: null },
    ]
    expect(spendSince(entries, since)).toBe(150)
  })
})

describe("customerTexts", () => {
  const base = {
    order_points: 255,
    balance: 1200,
    tier_name: "Srebro",
    next_tier: { name: "Złoto", remaining: 340 },
    expires_at: "2027-11-13T12:00:00Z",
    currency_code: "pln",
    time_zone: "Europe/Warsaw",
  }

  it("writes the sentences in Polish with correct plurals", () => {
    const texts = customerTexts(base, "pl")
    expect(texts.order).toBe("Za to zamówienie dostaniesz 255 punktów.")
    expect(texts.balance).toBe("Masz 1200 punktów.")
    expect(texts.tier).toBe("Twój poziom: Srebro.")
    expect(plain(texts.next_tier)).toBe("Do poziomu Złoto brakuje 340,00 zł.")
    expect(texts.expiry).toBe("Punkty wygasną 13 lis 2027, jeśli do tego czasu nic nie kupisz ani nie wymienisz.")
    expect(customerTexts({ ...base, order_points: 22 }, "pl").order).toBe("Za to zamówienie dostaniesz 22 punkty.")
    expect(customerTexts({ ...base, order_points: 1 }, "pl").order).toBe("Za to zamówienie dostaniesz 1 punkt.")
  })

  it("writes them in English", () => {
    const texts = customerTexts(base, "en")
    expect(texts.order).toBe("You will get 255 points for this order.")
    expect(plain(texts.next_tier)).toBe("PLN 340.00 more to reach Złoto.")
  })

  it("leaves out what does not apply", () => {
    const texts = customerTexts({ ...base, order_points: 0, tier_name: null, next_tier: null, balance: 0 }, "pl")
    expect(texts.order).toBeNull()
    expect(texts.tier).toBeNull()
    expect(texts.next_tier).toBeNull()
    expect(texts.expiry).toBeNull()
  })
})

describe("reward validation", () => {
  const reward = { name: "Rabat", kind: "fixed", value: 20, cost: 500 }

  it("accepts a complete reward and fills the defaults", () => {
    expect(AdminReward.parse(reward)).toMatchObject({ active: true, per_customer_limit: null, code_valid_days: null })
  })

  it("checks the rules of each kind", () => {
    expect(AdminReward.safeParse({ ...reward, value: 0 }).success).toBe(false)
    expect(AdminReward.safeParse({ ...reward, kind: "percentage", value: 120 }).success).toBe(false)
    expect(AdminReward.safeParse({ ...reward, kind: "percentage", value: 10 }).success).toBe(true)
    expect(AdminReward.safeParse({ ...reward, kind: "gift", value: null }).success).toBe(false)
    expect(AdminReward.safeParse({ ...reward, kind: "gift", value: null, variant_id: "variant_1" }).success).toBe(true)
    expect(AdminReward.safeParse({ ...reward, kind: "free_shipping", value: null }).success).toBe(true)
    expect(AdminReward.safeParse({ ...reward, cost: 0 }).success).toBe(false)
  })
})

describe("ledger CSV", () => {
  it("writes the ledger with translated types and the balance after each entry", () => {
    const csv = ledgerCsv(
      [
        {
          created_at: "2026-11-13T12:00:00Z",
          type: "adjustment",
          reason: "manual",
          points: -50,
          balance_after: 150,
          description: "Reklamacja; #12",
          order_id: null,
          code: null,
          actor_type: "admin",
          actor_id: "user_1",
        },
      ],
      "pl",
      "Europe/Warsaw"
    )
    const [header, row] = csv.split("\r\n")
    expect(header).toBe("﻿Data;Typ;Przyczyna;Punkty;Saldo po;Opis;Zamówienie;Kod;Kto;ID użytkownika")
    expect(row).toBe('13.11.2026, 13:00;korekta ręczna;korekta;-50;150;"Reklamacja; #12";;;administrator;user_1')
  })
})
