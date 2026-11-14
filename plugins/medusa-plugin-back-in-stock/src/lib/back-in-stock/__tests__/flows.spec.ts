import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { BACK_IN_STOCK_MODULE } from "../../../modules/back-in-stock"
import { handleLinkPage } from "../api/pages"
import { RateLimiter, storeSalesChannel } from "../api/utils"
import { BackInStockEvents } from "../events"
import { parseOptions } from "../options"
import { mergeSettings } from "../settings"
import { subscribe } from "../subscriptions"
import { openPairs, variantsForEvent } from "../targets"
import { hashToken } from "../tokens"
import type { SubscriptionRecord } from "../types"
import { MemoryStore, VARIANT } from "./fixtures"

type Variant = { id: string; manage_inventory: boolean; allow_backorder: boolean; stock: number | null }

/**
 * A container with a fake back-in-stock module (the in-memory store plus
 * the service methods the flows use) and a query that answers the graph
 * calls of availability, catalog and event resolution.
 */
function setup(
  config: { options?: Record<string, unknown>; variants?: Variant[]; settings?: Record<string, unknown> } = {}
) {
  const parsed = parseOptions({
    backendUrl: "https://api.shop.test",
    storefrontUrl: "https://shop.test",
    ...config.options,
  })
  if (!parsed.enabled) {
    throw new Error(parsed.reason)
  }
  const options = parsed.options
  const store = new MemoryStore()
  const tokens: Array<{
    id: string
    subscription_id: string
    purpose: string
    token_hash: string
    used_at: Date | null
  }> = []
  const variants = config.variants ?? [{ id: VARIANT, manage_inventory: true, allow_backorder: false, stock: 0 }]

  const matches = (row: Record<string, unknown>, filters: Record<string, unknown>) =>
    Object.entries(filters).every(([key, expected]) => {
      if (key === "$or") {
        return (expected as Array<Record<string, unknown>>).some((alternative) => matches(row, alternative))
      }
      return Array.isArray(expected) ? expected.includes(row[key]) : row[key] === expected
    })

  const service = {
    ...store,
    isEnabled: async () => true,
    getDisabledReason: async () => null,
    getOptions: async () => options,
    getSettings: async () => mergeSettings(options, config.settings ?? {}),
    getCheck: store.getCheck.bind(store),
    claimCheck: store.claimCheck.bind(store),
    finishCheck: store.finishCheck.bind(store),
    upsertCheck: store.upsertCheck.bind(store),
    getState: store.getState.bind(store),
    saveState: store.saveState.bind(store),
    listNotifiable: store.listNotifiable.bind(store),
    claimNotification: store.claimNotification.bind(store),
    completeNotification: store.completeNotification.bind(store),
    issueToken: async (subscriptionId: string, purpose: string) => {
      const token = `${purpose}-token-`.padEnd(43, "x")
      tokens.push({
        id: `bitok_${tokens.length + 1}`,
        subscription_id: subscriptionId,
        purpose,
        token_hash: hashToken(token),
        used_at: null,
      })
      return token
    },
    listBackInStockSubscriptions: async (filters: Record<string, unknown>) =>
      store.subscriptions
        .filter((row) => matches(row as unknown as Record<string, unknown>, filters))
        .map((row) => ({ ...row })),
    createBackInStockSubscriptions: async (data: Partial<SubscriptionRecord>) =>
      store.addSubscription({ ...data, notification_count: 0, last_notified_at: null } as Partial<SubscriptionRecord>),
    updateBackInStockSubscriptions: async (data: Partial<SubscriptionRecord> & { id: string }) => {
      const row = store.subscriptions.find((entry) => entry.id === data.id)!
      Object.assign(row, data)
      return { ...row }
    },
    updateBackInStockTokens: async (data: { id: string; used_at: Date }) => {
      Object.assign(
        tokens.find((token) => token.id === data.id)!,
        data
      )
    },
    findByToken: async (token: string, purpose: string) => {
      const row = tokens.find((entry) => entry.token_hash === hashToken(token) && entry.purpose === purpose)
      const subscription = row && store.subscriptions.find((entry) => entry.id === row.subscription_id)
      return row && subscription
        ? { subscription: { ...subscription }, token_id: row.id, used: Boolean(row.used_at) }
        : null
    },
  }

  const graph = jest.fn(async ({ entity, filters }: { entity: string; filters?: Record<string, unknown> }) => {
    const ids = (filters?.id ?? filters?.variant_id ?? []) as string[]
    switch (entity) {
      case "product_variant":
        return {
          data: variants
            .filter((variant) => ids.includes(variant.id))
            .map((variant) => ({
              ...variant,
              title: "M",
              product_id: "prod_1",
              product: { id: "prod_1", title: "Hoodie", handle: "hoodie" },
            })),
        }
      case "product_variant_inventory_items":
        if (filters?.inventory_item_id) {
          return { data: [{ variant_id: VARIANT }, { variant_id: "variant_kit" }] }
        }
        return {
          data: variants
            .filter((variant) => ids.includes(variant.id) && variant.stock !== null)
            .map((variant) => ({
              variant_id: variant.id,
              required_quantity: 1,
              variant: { manage_inventory: variant.manage_inventory, allow_backorder: variant.allow_backorder },
              inventory: { location_levels: [{ location_id: "sloc_1", available_quantity: variant.stock }] },
            })),
        }
      case "sales_channel_locations":
        return { data: [{ stock_location_id: "sloc_1" }] }
      case "inventory_level":
        return { data: ids.filter((id) => id !== "ilev_gone").map((id) => ({ id, inventory_item_id: "iitem_1" })) }
      default:
        return { data: [] }
    }
  })

  const emitted: Array<{ name: string; data: unknown }> = []
  const notifications = jest.fn(async () => ({ id: "noti_1" }))
  const registrations: Record<string, unknown> = {
    [BACK_IN_STOCK_MODULE]: service,
    [ContainerRegistrationKeys.QUERY]: { graph },
    [ContainerRegistrationKeys.LOGGER]: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    [Modules.EVENT_BUS]: { emit: jest.fn(async (event: { name: string; data: unknown }) => emitted.push(event)) },
    [Modules.NOTIFICATION]: { createNotifications: notifications },
    [Modules.STORE]: { listStores: async () => [{ name: "Test Shop" }] },
  }
  const container = {
    resolve: (key: string) => {
      if (!(key in registrations)) {
        throw new Error(`Could not resolve '${key}'`)
      }
      return registrations[key]
    },
  } as never
  return { container, store, tokens, emitted, notifications, graph }
}

const input = {
  email: " Anna@Example.com ",
  variant_id: VARIANT,
  sales_channel_id: "sc_1",
  locale: "pl-PL",
  country_code: "PL",
}

describe("subscribe", () => {
  it("creates an active subscription and records the variant as out of stock", async () => {
    const test = setup()
    const result = await subscribe(test.container, input)

    expect(result).toMatchObject({ created: true, confirmation_sent: false })
    expect(result.subscription).toMatchObject({
      email: "anna@example.com",
      status: "active",
      // Kept as the full code, so the emails plugin can match the store's language.
      locale: "pl-PL",
      country_code: "pl",
      product_id: "prod_1",
      consent_text: expect.stringContaining("dopóki go nie kupisz"),
    })
    expect(test.store.states.get(`${VARIANT}|sc_1`)).toMatchObject({ in_stock: false, available: 0 })
    expect(test.emitted).toEqual([expect.objectContaining({ name: BackInStockEvents.SUBSCRIBED })])
  })

  it.each([
    ["in stock", { manage_inventory: true, allow_backorder: false, stock: 4 }],
    ["not stock-managed", { manage_inventory: false, allow_backorder: false, stock: 0 }],
    ["backorderable", { manage_inventory: true, allow_backorder: true, stock: 0 }],
  ])("refuses a variant that is %s", async (_name, variant) => {
    const test = setup({ variants: [{ id: VARIANT, ...variant }] })
    await expect(subscribe(test.container, input)).rejects.toMatchObject({ code: "variant_in_stock" })
    expect(test.store.subscriptions).toHaveLength(0)
  })

  it("accepts variants without an inventory item (they show up as a problem in the admin)", async () => {
    const test = setup({ variants: [{ id: VARIANT, manage_inventory: true, allow_backorder: false, stock: null }] })
    expect((await subscribe(test.container, input)).created).toBe(true)
    expect(test.store.states.get(`${VARIANT}|sc_1`)).toMatchObject({ reason: "no_inventory_item" })
  })

  it("rejects unknown variants and invalid addresses", async () => {
    const test = setup()
    await expect(subscribe(test.container, { ...input, variant_id: "variant_x" })).rejects.toThrow("was not found")
    await expect(subscribe(test.container, { ...input, email: "nope" })).rejects.toThrow("valid email")
  })

  it("returns the open subscription instead of creating a second one", async () => {
    const test = setup()
    const first = await subscribe(test.container, input)
    const second = await subscribe(test.container, { ...input, email: "ANNA@example.com" })
    expect(second).toMatchObject({ created: false, subscription: { id: first.subscription.id } })
    expect(test.store.subscriptions).toHaveLength(1)
  })

  it("asks for confirmation with double opt-in", async () => {
    const test = setup({ settings: { doubleOptIn: true } })
    const result = await subscribe(test.container, input)

    expect(result).toMatchObject({
      created: true,
      confirmation_sent: true,
      subscription: { status: "pending", confirmed_at: null },
    })
    const email = (
      test.notifications.mock.calls as unknown as Array<[{ content: { subject: string; html: string } }]>
    )[0][0]
    expect(email.content.subject).toBe("Potwierdź powiadomienie o dostępności")
    expect(email.content.html).toContain("https://api.shop.test/hooks/back-in-stock/confirm/confirm-token-")
    expect(email.content.html).toContain("https://api.shop.test/hooks/back-in-stock/unsubscribe/unsubscribe-token-")
    // The confirmation does not count toward the notification limit.
    expect(test.store.subscriptions[0].notification_count).toBe(0)
    expect(test.tokens.map((token) => token.purpose).sort()).toEqual(["confirm", "unsubscribe"])
  })
})

describe("link pages", () => {
  function page(test: ReturnType<typeof setup>, token: string) {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: "",
      redirectedTo: null as string | null,
      setHeader(name: string, value: string) {
        this.headers[name] = value
        return this
      },
      status(code: number) {
        this.statusCode = code
        return this
      },
      send(body: string) {
        this.body = body
        return this
      },
      redirect(code: number, url: string) {
        this.statusCode = code
        this.redirectedTo = url
        return this
      },
    }
    const req = { scope: test.container, params: { token } } as unknown as MedusaRequest
    return { req, res: res as unknown as MedusaResponse & typeof res }
  }

  async function subscribed(settings: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
    const test = setup({ settings, options })
    await subscribe(test.container, input)
    const confirm = settings.doubleOptIn ? "confirm-token-".padEnd(43, "x") : null
    const unsubscribe = await (
      test.container as unknown as {
        resolve: (key: string) => { issueToken: (id: string, purpose: string) => Promise<string> }
      }
    )
      .resolve(BACK_IN_STOCK_MODULE)
      .issueToken(test.store.subscriptions[0].id, "unsubscribe")
    return { test, confirm, unsubscribe }
  }

  it("never unsubscribes on GET: mail scanners open links", async () => {
    const { test, unsubscribe } = await subscribed()
    const { req, res } = page(test, unsubscribe)
    await handleLinkPage(req, res, "unsubscribe", "GET")

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<form method="post" action="/hooks/back-in-stock/unsubscribe/')
    expect(res.body).toContain("Wypisz się")
    expect(res.body).toContain("Hoodie · M")
    expect(res.headers["Cache-Control"]).toBe("no-store")
    expect(test.store.subscriptions[0].status).toBe("active")
  })

  it("unsubscribes on POST, and says so again on a second POST", async () => {
    const { test, unsubscribe } = await subscribed()
    const first = page(test, unsubscribe)
    await handleLinkPage(first.req, first.res, "unsubscribe", "POST")
    expect(first.res.statusCode).toBe(200)
    expect(first.res.body).toContain("Wypisano")
    expect(test.store.subscriptions[0]).toMatchObject({ status: "unsubscribed", ended_at: expect.any(Date) })

    const again = page(test, unsubscribe)
    await handleLinkPage(again.req, again.res, "unsubscribe", "POST")
    expect(again.res.statusCode).toBe(200)
  })

  it("never confirms on GET, confirms on POST", async () => {
    const { test, confirm } = await subscribed({ doubleOptIn: true })
    const get = page(test, confirm!)
    await handleLinkPage(get.req, get.res, "confirm", "GET")
    expect(get.res.body).toContain('<form method="post"')
    expect(test.store.subscriptions[0].status).toBe("pending")

    const post = page(test, confirm!)
    await handleLinkPage(post.req, post.res, "confirm", "POST")
    expect(post.res.body).toContain("Powiadomienie potwierdzone")
    expect(test.store.subscriptions[0]).toMatchObject({ status: "active", confirmed_at: expect.any(Date) })
  })

  it("redirects to the storefront page when one is configured, without acting", async () => {
    const { test, unsubscribe } = await subscribed(
      {},
      { urls: { unsubscribe: "{storefrontUrl}/u?token={token}", confirm: "{storefrontUrl}/c?token={token}" } }
    )
    const { req, res } = page(test, unsubscribe)
    await handleLinkPage(req, res, "unsubscribe", "GET")
    expect(res.statusCode).toBe(302)
    expect(res.redirectedTo).toBe(`https://shop.test/u?token=${encodeURIComponent(unsubscribe)}`)
    expect(test.store.subscriptions[0].status).toBe("active")
  })

  it("shows the invalid page for unknown or malformed tokens", async () => {
    const test = setup()
    for (const token of ["../../etc", "x".repeat(43)]) {
      const { req, res } = page(test, token)
      await handleLinkPage(req, res, "unsubscribe", "POST")
      expect(res.statusCode).toBe(404)
      expect(res.body).toContain("This link is no longer valid")
    }
  })
})

describe("stock events", () => {
  it("map inventory levels to every variant using the item, kits included", async () => {
    const test = setup()
    expect(await variantsForEvent(test.container, "inventory.inventory-level.updated", { id: "ilev_1" })).toEqual([
      VARIANT,
      "variant_kit",
    ])
    expect(test.graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "inventory_level", withDeleted: true }))
  })

  it("fall back to every waiting variant when a row is gone", async () => {
    const test = setup()
    expect(
      await variantsForEvent(test.container, "inventory.inventory-level.deleted", { id: ["ilev_1", "ilev_gone"] })
    ).toBe("all")
  })

  it("use variant events directly and ignore empty payloads", async () => {
    const test = setup()
    expect(await variantsForEvent(test.container, "product-variant.updated", { id: "variant_9" })).toEqual([
      "variant_9",
    ])
    expect(await variantsForEvent(test.container, "inventory.reservation-item.created", {})).toEqual([])
  })

  it("only track variants someone is waiting for", async () => {
    const test = setup()
    test.store.addSubscription({ sales_channel_id: "sc_1" })
    test.store.addSubscription({ sales_channel_id: "sc_1" })
    test.store.addSubscription({ sales_channel_id: "sc_2", status: "pending" })
    test.store.addSubscription({ sales_channel_id: "sc_3", status: "unsubscribed" })
    expect(await openPairs(test.container, [VARIANT, "variant_other"])).toEqual([
      { variant_id: VARIANT, sales_channel_id: "sc_1" },
      { variant_id: VARIANT, sales_channel_id: "sc_2" },
    ])
    expect(await openPairs(test.container, [])).toEqual([])
  })
})

describe("store request helpers", () => {
  const request = (channels: string[]) =>
    ({ publishable_key_context: { key: "pk", sales_channel_ids: channels } }) as unknown as MedusaRequest

  it("uses the publishable key's only sales channel", () => {
    expect(storeSalesChannel(request(["sc_1"]))).toBe("sc_1")
  })

  it("needs sales_channel_id when the key has several, and checks it belongs to the key", () => {
    expect(() => storeSalesChannel(request(["sc_1", "sc_2"]))).toThrow(/pass sales_channel_id/)
    expect(storeSalesChannel(request(["sc_1", "sc_2"]), "sc_2")).toBe("sc_2")
    expect(() => storeSalesChannel(request(["sc_1"]), "sc_9")).toThrow(/not linked/)
  })

  it("limits requests per visitor and minute", () => {
    let time = 0
    const limiter = new RateLimiter(() => time)
    expect([1, 2, 3].map(() => limiter.allow("1.2.3.4", 2))).toEqual([true, true, false])
    time = 61_000
    expect(limiter.allow("1.2.3.4", 2)).toBe(true)
  })
})
