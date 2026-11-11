import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { WHITELIST_VAT_MODULE } from "../../../modules/whitelist-vat"
import { rejectUnverifiedCart, whitelistVatMiddlewares } from "../api/middlewares"
import { describeForStore, describeSubject, RateLimiter } from "../api/utils"
import { WhitelistVatEvents } from "../events"
import { parseOptions, pluginOptionsSchema, type WhitelistVatPluginOptionsInput } from "../options"
import { findTaxId, verifyAndEmit, verifyOrder } from "../records"
import { OUTCOMES } from "../registers/types"
import { STATUSES, type Status } from "../verdict"
import type { Verification } from "../verify"

const KEYS = ["vat_number", "nip"]

function verification(status: Status, extra: Partial<Verification> = {}): Verification {
  return {
    tax_id: { input: "5260250274", number: "5260250274", kind: "nip", country_code: "PL", valid: true },
    status,
    verified: ["active", "exempt", "valid"].includes(status),
    could_not_verify: status === "unverified",
    company: {
      name: "ACME SP. Z O.O.",
      address: "UL. LIPOWA 1, 00-001 WARSZAWA",
      street: "UL. LIPOWA 1",
      postal_code: "00-001",
      city: "WARSZAWA",
      regon: "011417295",
      bank_accounts: ["61109010140000071219812874"],
    },
    sources: { mf: { outcome: "active", request_id: "mf-1", checked_at: "2026-11-10T10:00:00.000Z", error: null } },
    checked_at: "2026-11-10T10:00:00.000Z",
    stale: false,
    from_cache: false,
    subject_id: "wvsub_1",
    ...extra,
  }
}

function createContainer(config: {
  options?: WhitelistVatPluginOptionsInput | Record<string, unknown>
  records?: Record<string, unknown[]>
  verify?: jest.Mock
}) {
  const parsed = parseOptions(config.options ?? {})
  const verify = config.verify ?? jest.fn(async () => verification("active"))
  const service = {
    isEnabled: async () => parsed.enabled,
    getOptions: async () => {
      if (!parsed.enabled) {
        throw new Error("disabled")
      }
      return parsed.options
    },
    verify,
  }
  const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
  const eventBus = { emit: jest.fn(async () => undefined) }
  const query = {
    graph: jest.fn(async ({ entity, filters }: { entity: string; filters: { id: string } }) => ({
      data: (config.records?.[entity] ?? []).filter((record) => (record as { id: string }).id === filters.id),
    })),
  }
  const registrations: Record<string, unknown> = {
    [WHITELIST_VAT_MODULE]: service,
    [ContainerRegistrationKeys.LOGGER]: logger,
    [ContainerRegistrationKeys.QUERY]: query,
    [Modules.EVENT_BUS]: eventBus,
  }
  const container = { resolve: (key: string) => registrations[key] } as never
  return { container, verify, logger, eventBus, query }
}

describe("plugin options", () => {
  it("works without any options", () => {
    const result = parseOptions(undefined)
    expect(result.enabled).toBe(true)
    expect(pluginOptionsSchema.parse({})).toMatchObject({
      cacheTtlHours: 24,
      timeoutMs: 8000,
      defaultCountry: "PL",
      mf: { enabled: true, environment: "production", dailyLimit: 95 },
      vies: { enabled: true },
      gus: { environment: "production" },
      taxIdKeys: ["vat_number", "nip", "tax_id", "vat_id"],
      orders: { verifyOnPlaced: true },
      checkout: { rejectOnCompletion: false, rejectStatuses: ["invalid", "not_found"] },
      store: { enabled: true, rateLimitPerMinute: 10 },
    })
  })

  it("stays disabled on invalid options without echoing values", () => {
    const result = parseOptions({ timeoutMs: 5, vies: { requesterVatNumber: "12345" } })
    expect(result.enabled).toBe(false)
    const reason = (result as { reason: string }).reason
    expect(reason).toContain("timeoutMs")
    expect(reason).toContain("vies.requesterVatNumber")
    expect(reason).not.toContain("12345")
  })

  it('never lets a store reject "could not verify"', () => {
    expect(parseOptions({ checkout: { rejectStatuses: ["unverified"] } }).enabled).toBe(false)
    expect(parseOptions({ checkout: { rejectStatuses: ["invalid", "unregistered", "inactive"] } }).enabled).toBe(true)
  })
})

describe("findTaxId", () => {
  it("looks at the billing address, the shipping address, the record, then the customer", () => {
    const holder = {
      metadata: { nip: "from-record" },
      billing_address: { metadata: { vat_number: " PL5260250274 " }, country_code: "pl" },
      shipping_address: { metadata: { nip: "from-shipping" }, country_code: "de" },
      customer: { metadata: { nip: "from-customer" } },
    }
    expect(findTaxId(holder, KEYS)).toEqual({ number: "PL5260250274", country_code: "pl", location: "billing_address" })
    expect(findTaxId({ ...holder, billing_address: { country_code: "pl" } }, KEYS)).toMatchObject({
      number: "from-shipping",
      location: "shipping_address",
      country_code: "pl",
    })
    expect(findTaxId({ metadata: holder.metadata, customer: holder.customer }, KEYS)).toMatchObject({
      number: "from-record",
      location: "metadata",
      country_code: null,
    })
    expect(findTaxId({ customer: holder.customer }, KEYS)).toMatchObject({
      number: "from-customer",
      location: "customer",
    })
  })

  it("respects the order of the keys and ignores empty values", () => {
    expect(findTaxId({ metadata: { nip: "second", vat_number: "first" } }, KEYS)?.number).toBe("first")
    expect(findTaxId({ metadata: { vat_number: "  ", nip: 5260250274 } }, KEYS)?.number).toBe("5260250274")
    expect(findTaxId({ metadata: { other: "x" } }, KEYS)).toBeNull()
    expect(findTaxId(null, KEYS)).toBeNull()
  })
})

describe("verifying records", () => {
  const order = {
    id: "order_1",
    customer_id: "cus_1",
    metadata: null,
    billing_address: { metadata: { vat_number: "5260250274" }, country_code: "pl" },
  }

  it("verifies the tax ID of an order with the order as context", async () => {
    const test = createContainer({ records: { order: [order] } })
    const result = await verifyOrder(test.container, "order_1")

    expect(test.verify).toHaveBeenCalledWith({
      number: "5260250274",
      country_code: "pl",
      force: undefined,
      trigger: "order",
      order_id: "order_1",
      customer_id: "cus_1",
    })
    expect(result.tax_id).toMatchObject({ number: "5260250274", location: "billing_address" })
    expect(result.verification?.status).toBe("active")
    expect(test.eventBus.emit).toHaveBeenCalledWith({
      name: WhitelistVatEvents.VERIFIED,
      data: expect.objectContaining({
        number: "5260250274",
        status: "active",
        order_id: "order_1",
        customer_id: "cus_1",
      }),
    })
  })

  it("leaves orders without a tax ID alone", async () => {
    const test = createContainer({ records: { order: [{ id: "order_1", metadata: {} }] } })
    expect(await verifyOrder(test.container, "order_1")).toEqual({ tax_id: null, verification: null })
    expect(test.verify).not.toHaveBeenCalled()
  })

  it("says so when the order does not exist", async () => {
    const test = createContainer({})
    await expect(verifyOrder(test.container, "order_404")).rejects.toThrow("order order_404 was not found")
  })

  it("does not announce answers served from the cache or wrong numbers", async () => {
    const cached = createContainer({ verify: jest.fn(async () => verification("active", { from_cache: true })) })
    await verifyAndEmit(cached.container, { number: "5260250274" })
    expect(cached.eventBus.emit).not.toHaveBeenCalled()

    const wrong = createContainer({
      verify: jest.fn(async () =>
        verification("invalid", {
          tax_id: { input: "1", number: "1", kind: "nip", country_code: "PL", valid: false, problem: "format" },
        })
      ),
    })
    await verifyAndEmit(wrong.container, { number: "1" })
    expect(wrong.eventBus.emit).not.toHaveBeenCalled()
  })
})

describe("checkout guard", () => {
  const cart = {
    id: "cart_1",
    customer_id: "cus_1",
    billing_address: { metadata: { vat_number: "5260250274" }, country_code: "pl" },
  }
  const run = async (config: Parameters<typeof createContainer>[0]) => {
    const test = createContainer({ records: { cart: [cart] }, ...config })
    const next = jest.fn()
    await rejectUnverifiedCart(
      { scope: test.container, params: { id: "cart_1" } } as unknown as MedusaRequest,
      {} as MedusaResponse,
      next
    )
    return { ...test, next }
  }
  const reject = { checkout: { rejectOnCompletion: true } }

  it("is attached to cart completion", () => {
    expect(whitelistVatMiddlewares[0]).toMatchObject({ matcher: "/store/carts/:id/complete", method: ["POST"] })
  })

  it("does nothing unless the store turned it on", async () => {
    const { next, verify } = await run({ verify: jest.fn(async () => verification("invalid")) })
    expect(verify).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it.each(["invalid", "not_found"] as Status[])("rejects a cart whose tax ID is %s", async (status) => {
    const { next, verify } = await run({ options: reject, verify: jest.fn(async () => verification(status)) })
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ number: "5260250274", cart_id: "cart_1", trigger: "checkout" })
    )
    expect(next).toHaveBeenCalledTimes(1)
    const error = next.mock.calls[0][0] as Error
    expect(error.message).toContain("5260250274")
    expect(error.message).toContain(status)
  })

  it.each(["active", "exempt", "valid", "unregistered", "inactive", "unverified"] as Status[])(
    "lets a cart through when the verdict is %s",
    async (status) => {
      const { next } = await run({ options: reject, verify: jest.fn(async () => verification(status)) })
      expect(next).toHaveBeenCalledWith()
    }
  )

  it("rejects the verdicts the store chose", async () => {
    const { next } = await run({
      options: { checkout: { rejectOnCompletion: true, rejectStatuses: ["unregistered"] } },
      verify: jest.fn(async () => verification("unregistered")),
    })
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it("lets carts without a tax ID through", async () => {
    const { next, verify } = await run({ options: reject, records: { cart: [{ id: "cart_1", metadata: {} }] } })
    expect(verify).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it("never blocks checkout because the check itself failed", async () => {
    const { next, logger } = await run({
      options: reject,
      verify: jest.fn(async () => {
        throw new Error("database is down")
      }),
    })
    expect(next).toHaveBeenCalledWith()
    expect(logger.warn.mock.calls[0][0]).toContain(
      "[whitelist-vat] Skipped the checkout check for cart cart_1: database is down"
    )
  })

  it("stays out of the way when the plugin is disabled", async () => {
    const { next } = await run({ options: { timeoutMs: 1 } })
    expect(next).toHaveBeenCalledWith()
  })
})

describe("API views", () => {
  it("gives storefronts the verdict and invoice data, nothing else", () => {
    const view = describeForStore(verification("active"))
    expect(view).toEqual({
      tax_id: { number: "5260250274", kind: "nip", country_code: "PL", valid_format: true, problem: null },
      status: "active",
      verified: true,
      could_not_verify: false,
      company: {
        name: "ACME SP. Z O.O.",
        address: "UL. LIPOWA 1, 00-001 WARSZAWA",
        street: "UL. LIPOWA 1",
        postal_code: "00-001",
        city: "WARSZAWA",
        regon: "011417295",
        krs: null,
      },
      checked_at: "2026-11-10T10:00:00.000Z",
    })
    const text = JSON.stringify(view)
    expect(text).not.toContain("61109010140000071219812874")
    expect(text).not.toContain("mf-1")
  })

  it("marks stored answers older than the cache time as stale", () => {
    const subject = {
      id: "wvsub_1",
      number: "5260250274",
      kind: "nip" as const,
      country_code: "PL",
      status: "active" as const,
      name: "ACME",
      address: null,
      company: null,
      sources: null,
      bank_account_count: 0,
      customer_id: null,
      checked_at: new Date(Date.now() - 2 * 3_600_000),
    }
    expect(describeSubject(subject, { cacheTtlHours: 24 })).toMatchObject({ stale: false, verified: true, sources: {} })
    expect(describeSubject(subject, { cacheTtlHours: 1 }).stale).toBe(true)
    expect(
      describeSubject({ ...subject, checked_at: null, status: "unverified" }, { cacheTtlHours: 24 })
    ).toMatchObject({
      stale: true,
      verified: false,
      checked_at: null,
    })
  })

  it("limits lookups per visitor and minute", () => {
    let time = 0
    const limiter = new RateLimiter(() => time)
    expect([1, 2, 3].map(() => limiter.allow("1.2.3.4", 2))).toEqual([true, true, false])
    expect(limiter.allow("5.6.7.8", 2)).toBe(true)
    time = 61_000
    expect(limiter.allow("1.2.3.4", 2)).toBe(true)
  })
})

describe("admin translations", () => {
  const read = (locale: string) =>
    JSON.parse(readFileSync(join(__dirname, `../../../admin/i18n/whitelist-vat/${locale}.json`), "utf8")) as Record<
      string,
      unknown
    >
  const flatten = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key))
      : [prefix]

  it("has every string in both languages, under the plugin's key", () => {
    const en = read("en")
    const pl = read("pl")
    expect(Object.keys(en)).toEqual(["whitelist-vat"])
    expect(Object.keys(pl)).toEqual(["whitelist-vat"])
    expect(flatten(pl).sort()).toEqual(flatten(en).sort())
  })

  it("names every verdict and every register answer", () => {
    const en = read("en")["whitelist-vat"] as Record<string, Record<string, string>>
    for (const status of STATUSES) {
      expect([status, typeof en.status[status], typeof en.statusHint[status]]).toEqual([status, "string", "string"])
    }
    for (const outcome of OUTCOMES) {
      expect([outcome, typeof en.outcome[outcome]]).toEqual([outcome, "string"])
    }
  })
})
