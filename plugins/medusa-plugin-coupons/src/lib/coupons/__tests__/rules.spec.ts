import { CODE_ALPHABET, codeCandidates, isValidCode, randomCode, suggestCode } from "../codes"
import { pluralPl } from "../format"
import {
  bilingualPolicyMessage,
  evaluatePolicy,
  hasExclusiveConflict,
  type PolicyInput,
  policyMessage,
} from "../policy"
import { pickTier, tierBand, validateTiers } from "../tiers"
import { validateDraft } from "../validation"
import { draft } from "./fixtures"

describe("tiers", () => {
  const tiers = [
    { min: 500, value: 10 },
    { min: 200, value: 5 },
    { min: 1000, value: 15 },
  ]

  it("picks the highest level reached, never more than one", () => {
    expect(pickTier(tiers, 100)).toBeNull()
    expect(pickTier(tiers, 200)).toEqual({ min: 200, value: 5 })
    expect(pickTier(tiers, 499.99)).toEqual({ min: 200, value: 5 })
    expect(pickTier(tiers, 500)).toEqual({ min: 500, value: 10 })
    expect(pickTier(tiers, 5000)).toEqual({ min: 1000, value: 15 })
  })

  it("gives each level a band that ends where the next one starts", () => {
    expect(tierBand(tiers, 0)).toEqual({ gte: 200, lt: 500 })
    expect(tierBand(tiers, 1)).toEqual({ gte: 500, lt: 1000 })
    expect(tierBand(tiers, 2)).toEqual({ gte: 1000, lt: null })
  })

  it("bands never overlap, so a basket matches exactly the tier pickTier returns", () => {
    for (const amount of [199, 200, 350, 500, 999.99, 1000, 2500]) {
      const matching = tiers
        .map((_, i) => tierBand(tiers, i))
        .filter((band) => amount >= band.gte && (band.lt == null || amount < band.lt))
      const picked = pickTier(tiers, amount)
      expect(matching.length).toBe(picked ? 1 : 0)
      if (picked) expect(matching[0].gte).toBe(picked.min)
    }
  })

  it("validates levels", () => {
    expect(validateTiers(tiers, "percentage")).toEqual([])
    expect(validateTiers([{ min: 200, value: 5 }], "percentage")).toEqual(["too_few"])
    expect(
      validateTiers(
        [
          { min: 0, value: 5 },
          { min: 100, value: 0 },
        ],
        "fixed"
      )
    ).toEqual(expect.arrayContaining(["min_not_positive", "value_not_positive"]))
    expect(
      validateTiers(
        [
          { min: 100, value: 120 },
          { min: 200, value: 5 },
        ],
        "percentage"
      )
    ).toContain("percent_over_100")
    expect(
      validateTiers(
        [
          { min: 100, value: 120 },
          { min: 200, value: 5 },
        ],
        "fixed"
      )
    ).not.toContain("percent_over_100")
    expect(
      validateTiers(
        [
          { min: 300, value: 5 },
          { min: 300, value: 10 },
        ],
        "percentage"
      )
    ).toContain("min_not_increasing")
    expect(
      validateTiers(
        [
          { min: 200, value: 10 },
          { min: 500, value: 5 },
        ],
        "percentage"
      )
    ).toEqual(["value_not_increasing"])
    expect(
      validateTiers(
        [
          { min: 200, value: 10 },
          { min: 500, value: 10 },
        ],
        "fixed"
      )
    ).toEqual(["value_not_increasing"])
  })
})

describe("validateDraft", () => {
  it("accepts a valid coupon", () => {
    expect(validateDraft(draft())).toEqual({ errors: [], warnings: [] })
  })

  it("requires a valid, free code unless automatic", () => {
    expect(validateDraft(draft({ code: null })).errors).toContain("code_required")
    expect(validateDraft(draft({ code: "  " })).errors).toContain("code_required")
    expect(validateDraft(draft({ code: "A B" })).errors).toContain("code_invalid")
    expect(validateDraft(draft({ code: "AB" })).errors).toContain("code_invalid")
    expect(validateDraft(draft(), { codeTaken: true }).errors).toContain("code_taken")
    expect(validateDraft(draft({ code: null, automatic: true, usage_limit: 5 })).errors).toEqual([])
  })

  it("rejects an end date before the start", () => {
    const d = draft({ starts_at: "2026-11-30T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" })
    expect(validateDraft(d).errors).toContain("ends_before_start")
    expect(validateDraft(draft({ ...d, ends_at: d.starts_at })).errors).toContain("ends_before_start")
  })

  it("checks values per kind", () => {
    expect(validateDraft(draft({ value: null })).errors).toContain("value_required")
    expect(validateDraft(draft({ value: 0 })).errors).toContain("percent_out_of_range")
    expect(validateDraft(draft({ value: 120 })).errors).toContain("percent_out_of_range")
    expect(validateDraft(draft({ kind: "fixed", value: 50, currency_code: null })).errors).toContain(
      "currency_required"
    )
    expect(validateDraft(draft({ kind: "category", category_ids: [] })).errors).toContain("category_required")
    expect(validateDraft(draft({ kind: "buy_get", buy_qty: 0, get_qty: 1 })).errors).toEqual(
      expect.arrayContaining(["buy_get_invalid", "buy_products_required"])
    )
    expect(validateDraft(draft({ kind: "free_shipping", value: null })).errors).toEqual([])
  })

  it("checks limits, audience and minimum basket", () => {
    expect(validateDraft(draft({ usage_limit: 0 })).errors).toContain("usage_limit_invalid")
    expect(validateDraft(draft({ usage_limit: 1.5 })).errors).toContain("usage_limit_invalid")
    expect(validateDraft(draft({ per_customer_limit: 0 })).errors).toContain("per_customer_limit_invalid")
    expect(validateDraft(draft({ audience: "groups", audience_ids: [] })).errors).toContain("audience_required")
    expect(validateDraft(draft({ min_subtotal: -1 })).errors).toContain("min_subtotal_invalid")
  })

  it("checks tiers and only allows them on percentage and fixed coupons", () => {
    expect(validateDraft(draft({ tiers: [{ min: 200, value: 5 }] })).errors).toContain("tiers_too_few")
    expect(
      validateDraft(
        draft({
          kind: "free_shipping",
          tiers: [
            { min: 1, value: 1 },
            { min: 2, value: 2 },
          ],
        })
      ).errors
    ).toContain("tiers_not_supported")
    expect(
      validateDraft(
        draft({
          value: null,
          tiers: [
            { min: 200, value: 5 },
            { min: 500, value: 10 },
          ],
        })
      ).errors
    ).toEqual([])
  })

  it("warns about overlapping coupons unless exclusive", () => {
    expect(validateDraft(draft(), { overlapsActive: true }).warnings).toContain("overlaps_active_coupon")
    expect(validateDraft(draft({ exclusive: true }), { overlapsActive: true }).warnings).not.toContain(
      "overlaps_active_coupon"
    )
  })

  it("warns about a 100% discount and a fixed discount at or above the minimum basket", () => {
    expect(validateDraft(draft({ value: 100 })).warnings).toContain("full_discount")
    expect(validateDraft(draft({ kind: "fixed", value: 300, min_subtotal: 300 })).warnings).toContain(
      "discount_above_minimum"
    )
    expect(validateDraft(draft({ kind: "fixed", value: 50, min_subtotal: 300 })).warnings).toEqual([])
  })

  it("warns about an automatic coupon with no conditions at all", () => {
    const auto = draft({ code: null, automatic: true })
    expect(validateDraft(auto).warnings).toContain("no_conditions_automatic")
    expect(validateDraft({ ...auto, min_subtotal: 100 }).warnings).not.toContain("no_conditions_automatic")
    expect(validateDraft({ ...auto, ends_at: "2027-01-01T00:00:00Z" }).warnings).not.toContain(
      "no_conditions_automatic"
    )
    expect(validateDraft(draft()).warnings).not.toContain("no_conditions_automatic")
  })
})

describe("evaluatePolicy", () => {
  const input = (overrides: Partial<PolicyInput> = {}, coupon: Partial<PolicyInput["coupon"]> = {}): PolicyInput => ({
    coupon: {
      exclusive: false,
      first_order_only: false,
      audience: "all",
      audience_ids: [],
      per_customer_limit: null,
      min_subtotal: null,
      currency_code: "pln",
      ...coupon,
    },
    customer: { id: null, group_ids: [] },
    email: "jan@example.com",
    orders_count: 0,
    uses_by_customer: 0,
    basket_total: 300,
    applied: [],
    group: "KOD",
    ...overrides,
  })

  it("lets a plain coupon through", () => {
    expect(evaluatePolicy(input())).toBeNull()
  })

  it("needs an e-mail for per-customer limits, so guests are counted too", () => {
    expect(evaluatePolicy(input({ email: null }, { per_customer_limit: 1 }))).toBe("email_required")
    expect(evaluatePolicy(input({ email: null }))).toBeNull()
  })

  it("checks the audience", () => {
    expect(evaluatePolicy(input({}, { audience: "customers", audience_ids: ["cus_1"] }))).toBe("audience")
    expect(
      evaluatePolicy(
        input({ customer: { id: "cus_1", group_ids: [] } }, { audience: "customers", audience_ids: ["cus_1"] })
      )
    ).toBeNull()
    expect(
      evaluatePolicy(
        input({ customer: { id: "cus_1", group_ids: ["g2"] } }, { audience: "groups", audience_ids: ["g1"] })
      )
    ).toBe("audience")
    expect(
      evaluatePolicy(
        input({ customer: { id: "cus_1", group_ids: ["g1"] } }, { audience: "groups", audience_ids: ["g1"] })
      )
    ).toBeNull()
  })

  it("allows first-order coupons only without earlier orders", () => {
    expect(evaluatePolicy(input({ orders_count: 1 }, { first_order_only: true }))).toBe("first_order")
    expect(evaluatePolicy(input({ orders_count: 0 }, { first_order_only: true }))).toBeNull()
  })

  it("enforces the per-customer limit", () => {
    expect(evaluatePolicy(input({ uses_by_customer: 1 }, { per_customer_limit: 1 }))).toBe("per_customer_limit")
    expect(evaluatePolicy(input({ uses_by_customer: 1 }, { per_customer_limit: 2 }))).toBeNull()
  })

  it("checks the minimum gross basket", () => {
    expect(evaluatePolicy(input({ basket_total: 299.99 }, { min_subtotal: 300 }))).toBe("min_subtotal")
    expect(evaluatePolicy(input({ basket_total: 300 }, { min_subtotal: 300 }))).toBeNull()
  })

  it("refuses to combine when either side is exclusive, but not within the same tier group", () => {
    const other = { group: "INNY", exclusive: false }
    expect(evaluatePolicy(input({ applied: [other] }))).toBeNull()
    expect(evaluatePolicy(input({ applied: [other] }, { exclusive: true }))).toBe("exclusive_conflict")
    expect(evaluatePolicy(input({ applied: [{ group: "INNY", exclusive: true }] }))).toBe("exclusive_conflict")
    expect(evaluatePolicy(input({ applied: [{ group: "KOD", exclusive: true }] }, { exclusive: true }))).toBeNull()
  })

  it("reports reasons in a fixed order", () => {
    const everything = input(
      { email: null, orders_count: 3, basket_total: 1, applied: [{ group: "X", exclusive: true }] },
      { per_customer_limit: 1, first_order_only: true, min_subtotal: 100, exclusive: true }
    )
    expect(evaluatePolicy(everything)).toBe("email_required")
    expect(evaluatePolicy({ ...everything, email: "a@b.pl" })).toBe("first_order")
  })

  it("detects conflicts between applied promotions", () => {
    expect(hasExclusiveConflict([])).toBe(false)
    expect(hasExclusiveConflict([{ group: "A", exclusive: true }])).toBe(false)
    expect(
      hasExclusiveConflict([
        { group: "A", exclusive: true },
        { group: "A", exclusive: true },
      ])
    ).toBe(false)
    expect(
      hasExclusiveConflict([
        { group: "A", exclusive: false },
        { group: "B", exclusive: false },
      ])
    ).toBe(false)
    expect(
      hasExclusiveConflict([
        { group: "A", exclusive: true },
        { group: "B", exclusive: false },
      ])
    ).toBe(true)
  })

  it("writes messages in both languages, with the minimum basket filled in", () => {
    const plain = (text: string) => text.replace(/ | /g, " ")
    expect(plain(policyMessage("min_subtotal", "pl", { min: 300, currency_code: "pln" }))).toBe(
      "Ten kupon wymaga koszyka od 300,00 zł brutto."
    )
    expect(plain(policyMessage("min_subtotal", "en", { min: 300, currency_code: "pln" }))).toBe(
      "This coupon needs a basket of at least PLN 300.00 gross."
    )
    expect(bilingualPolicyMessage("first_order")).toBe(
      "Ten kupon jest tylko na pierwsze zamówienie. / This coupon is only for your first order."
    )
  })
})

describe("codes", () => {
  it("generates codes from the unambiguous alphabet", () => {
    const code = randomCode(12, "NL-")
    expect(code).toMatch(/^NL-[A-Z0-9]{12}$/)
    expect([...code.slice(3)].every((c) => CODE_ALPHABET.includes(c))).toBe(true)
    expect(isValidCode(code)).toBe(true)
  })

  it("is deterministic with a given random source", () => {
    expect(randomCode(4, "", () => 0)).toBe("AAAA")
  })

  it("suggests readable codes and skips taken ones", () => {
    expect(suggestCode({ kind: "percentage", value: 15 })).toBe("RABAT15")
    expect(suggestCode({ kind: "free_shipping", value: 100 })).toBe("DOSTAWA")
    expect(suggestCode({ kind: "buy_get" })).toBe("GRATIS")
    expect(suggestCode({ kind: "percentage", value: 15 }, (c) => c === "RABAT15")).toBe("RABAT15-2")
    expect(suggestCode({ kind: "percentage", value: 15 }, () => true)).toMatch(/^[A-Z0-9]{8}$/)
    expect(codeCandidates({ kind: "fixed", value: 49.6 }, 3)).toEqual(["RABAT50", "RABAT50-2", "RABAT50-3"])
  })

  it("accepts codes case-insensitively", () => {
    expect(isValidCode("jesien15")).toBe(true)
    expect(isValidCode("-BAD")).toBe(false)
  })
})

describe("pluralPl", () => {
  it.each([
    [1, "użycie"],
    [2, "użycia"],
    [4, "użycia"],
    [5, "użyć"],
    [12, "użyć"],
    [14, "użyć"],
    [22, "użycia"],
    [25, "użyć"],
    [0, "użyć"],
  ])("%i → %s", (n, form) => {
    expect(pluralPl(n, ["użycie", "użycia", "użyć"])).toBe(form)
  })
})
