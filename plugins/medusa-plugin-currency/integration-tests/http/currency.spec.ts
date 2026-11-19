import path from "node:path"

import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createRegionsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { asValue } from "@medusajs/framework/awilix"

import { applyFill, buildPreview } from "../../src/lib/currency/fill"
import { CURRENCY_MODULE } from "../../src/modules/currency"
import type CurrencyModuleService from "../../src/modules/currency/service"

jest.setTimeout(300_000)

type Row = Record<string, any>

/* A fake NBP at nbp.test (medusa-config.ts points the plugin there). ------- */

const FIRST_TABLE = { no: "005/A/NBP/2026", date: "2026-01-08", eur: 4.4165, usd: 4.0176 }
const nbp = { down: false, calls: 0, table: { ...FIRST_TABLE } }
const realFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.startsWith("https://nbp.test/")) return realFetch(input, init)
    nbp.calls++
    if (nbp.down) throw new TypeError("fetch failed")
    const body = [
      {
        table: "A",
        no: nbp.table.no,
        effectiveDate: nbp.table.date,
        rates: [
          { currency: "euro", code: "EUR", mid: nbp.table.eur },
          { currency: "dolar amerykański", code: "USD", mid: nbp.table.usd },
        ],
      },
    ]
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

/**
 * The whole plugin in a running Medusa app: settings, rates, preview, the
 * checked save, price lists, region prices, the history, NBP outages and
 * demo mode. Store: PLN (default, gross), EUR (gross, region EU with DE and
 * FR), CZK (fixed rate, net).
 */
medusaIntegrationTestRunner({
  cwd: path.resolve(__dirname, "../.."),
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer
    let admin: Row
    let plRegion: string
    let euRegion: string
    let drill: Row
    let socket: Row
    let priceListId: string
    let events: Row[]

    const call = async (method: "get" | "post", url: string, body?: unknown) => {
      try {
        return method === "get" ? await api.get(url, admin) : await api.post(url, body ?? {}, admin)
      } catch (error) {
        const response = (error as { response?: Row }).response
        if (!response) throw error
        return response
      }
    }
    const pricing = () => container.resolve(Modules.PRICING)
    const pricesOf = async (variantId: string) => {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "product_variant",
        fields: ["id", "price_set.id"],
        filters: { id: variantId },
      })
      return (await pricing().listPrices({ price_set_id: [data[0].price_set.id] } as never, {
        relations: ["price_rules"],
      })) as Row[]
    }
    const plainPrice = (prices: Row[], currency: string): Row =>
      prices.find((p) => p.currency_code === currency && !p.price_list_id && !(p.price_rules ?? []).length) as Row
    const fill = (extra: Row = {}) => ({
      scope: { kind: "products", ids: [drill.id] },
      overwrite: false,
      price_lists: false,
      region_prices: false,
      allow_stale: false,
      ...extra,
    })
    const rowsOf = (preview: Row, currency: string) =>
      (preview.plan.rows as Row[]).filter((row) => row.currency === currency)

    beforeAll(async () => {
      container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)

      const { data: stores } = await query.graph({ entity: "store", fields: ["id", "default_sales_channel_id"] })
      await container.resolve(Modules.STORE).updateStores(stores[0].id, {
        supported_currencies: [
          { currency_code: "pln", is_default: true },
          { currency_code: "eur" },
          { currency_code: "czk" },
        ],
      })

      const { result: regions } = await createRegionsWorkflow(container).run({
        input: {
          regions: [
            { name: "Polska", currency_code: "pln", countries: ["pl"] },
            { name: "Unia Europejska", currency_code: "eur", countries: ["de", "fr"] },
            { name: "Czechy", currency_code: "czk", countries: ["cz"] },
          ],
        },
      })
      plRegion = regions[0].id
      euRegion = regions[1].id

      const tax = container.resolve(Modules.TAX)
      for (const [country, rate] of [
        ["pl", 23],
        ["de", 19],
        ["fr", 20],
        ["cz", 21],
      ] as const) {
        await tax.createTaxRegions({ country_code: country, default_tax_rate: { rate, name: "VAT", code: "VAT" } })
      }
      // Adding a store currency creates its preference (net); PLN and EUR prices are gross here.
      for (const [value, is_tax_inclusive] of [
        ["pln", true],
        ["eur", true],
        ["czk", false],
      ] as const) {
        const [existing] = await pricing().listPricePreferences({ attribute: "currency_code", value })
        if (existing) await pricing().updatePricePreferences(existing.id, { is_tax_inclusive })
        else await pricing().createPricePreferences({ attribute: "currency_code", value, is_tax_inclusive })
      }

      const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
      const shippingProfileId =
        profiles[0]?.id ??
        (
          await createShippingProfilesWorkflow(container).run({
            input: { data: [{ name: "Default", type: "default" }] },
          })
        ).result[0].id
      const { result: products } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Wiertarka",
              status: "published",
              shipping_profile_id: shippingProfileId,
              options: [{ title: "Moc", values: ["500 W", "850 W", "1200 W"] }],
              variants: [
                {
                  title: "500 W",
                  sku: "W-500",
                  options: { Moc: "500 W" },
                  prices: [{ amount: 123, currency_code: "pln" }],
                },
                {
                  title: "850 W",
                  sku: "W-850",
                  options: { Moc: "850 W" },
                  prices: [
                    { amount: 246, currency_code: "pln" },
                    { amount: 50, currency_code: "eur" },
                  ],
                },
                {
                  title: "1200 W",
                  sku: "W-1200",
                  options: { Moc: "1200 W" },
                  prices: [{ amount: 500, currency_code: "czk" }],
                },
              ],
            },
            {
              title: "Gniazdo",
              status: "published",
              shipping_profile_id: shippingProfileId,
              options: [{ title: "Kolor", values: ["białe"] }],
              variants: [
                {
                  title: "białe",
                  sku: "G-1",
                  options: { Kolor: "białe" },
                  prices: [{ amount: 61.5, currency_code: "pln" }],
                },
              ],
            },
          ],
        },
      })
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "product_id", "price_set.id"],
        filters: { product_id: products.map((p) => p.id) },
      })
      drill = {
        id: products[0].id,
        variants: Object.fromEntries(variants.filter((v) => v.product_id === products[0].id).map((v) => [v.sku, v])),
      }
      socket = { id: products[1].id, variant: variants.find((v) => v.product_id === products[1].id) }

      // A region price in PLN for Poland and a Black Friday list price.
      await pricing().addPrices({
        priceSetId: socket.variant.price_set.id,
        prices: [{ currency_code: "pln", amount: 59.04, rules: { region_id: plRegion } }],
      })
      const [list] = await pricing().createPriceLists([
        { title: "Black Friday", description: "-20%", status: "active" as never },
      ])
      priceListId = list.id
      await pricing().addPriceListPrices([
        {
          price_list_id: list.id,
          prices: [{ currency_code: "pln", amount: 98.4, price_set_id: drill.variants["W-500"].price_set.id }],
        },
      ])

      const user = await container
        .resolve(Modules.USER)
        .createUsers({ email: "ola@example.com", first_name: "Ola", last_name: "Nowak" })
      const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
        provider_identities: [{ provider: "emailpass", entity_id: "ola@example.com" }],
        app_metadata: { user_id: user.id },
      })
      const token = generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: identity.id, app_metadata: { user_id: user.id } },
        {
          secret: container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret as string,
          expiresIn: "1d",
        }
      )
      admin = { headers: { authorization: `Bearer ${token}` } }

      events = []
      container
        .resolve(Modules.EVENT_BUS)
        .subscribe("currency.prices_filled", async (event: Row) => void events.push(event.data), {
          subscriberId: "test-currency-filled",
        })

      const saved = await call("post", "/admin/currency/settings", {
        baseCurrency: null,
        baseTaxCountry: null,
        currencies: {
          eur: { enabled: true, mode: "api", marginPercent: "0", rounding: "none", tax: "gross", taxCountry: "de" },
          czk: { enabled: true, mode: "fixed", fixedRate: "0.17", rounding: "whole", tax: "gross", taxCountry: null },
        },
      })
      expect(saved.status).toBe(200)
    })

    // The runner restores the database to its state after beforeAll before every test.
    beforeEach(() => {
      nbp.down = false
      nbp.table = { ...FIRST_TABLE }
      events = []
    })

    /** Preview, then save exactly that preview. */
    const save = async (body: Row, extra: Row = {}) => {
      const preview = (await call("post", "/admin/currency/preview", body)).data
      const saved = await call("post", "/admin/currency/apply", {
        ...body,
        ...extra,
        fingerprint: preview.plan.fingerprint,
      })
      return { preview, saved }
    }

    it("reports the store, the rules and the NBP table with its number and date", async () => {
      const settings = await call("get", "/admin/currency/settings")
      expect(settings.data.store).toMatchObject({ base: { code: "pln" }, baseTaxCountry: "pl" })
      expect(settings.data.store.taxRates).toMatchObject({ pl: "23", de: "19", fr: "20" })
      expect(settings.data.rules.eur).toMatchObject({ mode: "api", taxCountry: "de" })

      const rates = await call("get", "/admin/currency/rates")
      expect(rates.data).toMatchObject({
        status: "fresh",
        table: { table: "005/A/NBP/2026", date: "2026-01-08", rates: { EUR: "4.4165" } },
      })

      const sample = await call("post", "/admin/currency/sample", {
        currency: "eur",
        rule: {
          enabled: true,
          mode: "api_margin",
          marginPercent: "3",
          rounding: "x99",
          tax: "gross",
          taxCountry: "de",
        },
      })
      // 100 / 4.4165 × 1.03 = 23.32 → 22.99 / 23.99: 22.99 is nearer.
      expect(sample.data.conversion).toMatchObject({ ok: true, amount: "22.99", warnings: ["tax_differs"] })

      const invalid = await call("post", "/admin/currency/settings", {
        currencies: { eur: { mode: "fixed", fixedRate: null } },
      })
      expect(invalid.status).toBe(400)
      expect(invalid.data.message).toContain("fixedRate")
    })

    it("fills only empty prices and says why the others are skipped", async () => {
      const preview = (await call("post", "/admin/currency/preview", fill())).data
      const eur = rowsOf(preview, "eur")
      const bySku = (sku: string) => eur.find((row: Row) => row.sku === sku)
      expect(bySku("W-500")).toMatchObject({
        action: "add",
        base_amount: "123",
        new_amount: "27.85",
        rate: { rate: "4.4165", source: { table: "005/A/NBP/2026", date: "2026-01-08" } },
        warnings: ["tax_differs"],
      })
      expect(bySku("W-850")).toMatchObject({
        action: "skip",
        reason: "already_set",
        current: { amount: "50", origin: { kind: "manual" } },
      })
      expect(bySku("W-1200")).toMatchObject({ action: "skip", reason: "no_base_price" })
      // CZK: fixed 0.17, net prices: 123 PLN gross → 100 net → 588.24 → whole.
      expect(rowsOf(preview, "czk").find((row: Row) => row.sku === "W-500")).toMatchObject({
        action: "add",
        new_amount: "588.00",
        tax: "strip",
        rate: { mode: "fixed", source: null },
      })

      const saved = await call("post", "/admin/currency/apply", { ...fill(), fingerprint: preview.plan.fingerprint })
      expect(saved.status).toBe(200)
      expect(saved.data).toMatchObject({ status: "saved", counts: { add: 3, overwrite: 0 } })

      const prices = await pricesOf(drill.variants["W-500"].id)
      expect(Number(plainPrice(prices, "eur").amount)).toBe(27.85)
      expect(Number(plainPrice(prices, "czk").amount)).toBe(588)
      expect(Number(plainPrice(await pricesOf(drill.variants["W-850"].id), "eur").amount)).toBe(50)

      // The history and the origin of each price.
      const runs = await call("get", "/admin/currency/runs")
      expect(runs.data.runs[0]).toMatchObject({
        actor_name: "Ola Nowak",
        added: 3,
        overwritten: 0,
        base_currency: "pln",
        rates: {
          eur: { rate: "4.4165", table: "005/A/NBP/2026", date: "2026-01-08" },
          czk: { mode: "fixed", rate: "0.17" },
        },
      })
      const product = await call("get", `/admin/currency/products/${drill.id}`)
      const w500 = product.data.variants.find((v: Row) => v.sku === "W-500")
      expect(w500.prices.find((p: Row) => p.currency === "eur").origin).toMatchObject({
        kind: "filled",
        rate: "4.4165",
        table: "005/A/NBP/2026",
      })
      const w850 = product.data.variants.find((v: Row) => v.sku === "W-850")
      expect(w850.prices.find((p: Row) => p.currency === "eur").origin).toEqual({ kind: "manual" })
      // W-1200 has no PLN price (no EUR either); its CZK price was set by hand.
      expect(product.data.missing).toEqual({ eur: 1, czk: 0 })

      // The event for other plugins (Omnibus: a rate change, not a promotion).
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(events[0]).toMatchObject({
        run_id: saved.data.run_id,
        base_currency: "pln",
        counts: { added: 3 },
        rates: { eur: { mode: "api", table: "005/A/NBP/2026" } },
      })
      expect(events[0].prices).toHaveLength(3)
    })

    it("overwrites set prices only after an explicit confirmation", async () => {
      await save(fill({ currencies: ["eur"] }))
      const preview = (await call("post", "/admin/currency/preview", fill({ overwrite: true, currencies: ["eur"] })))
        .data
      const w850 = rowsOf(preview, "eur").find((row: Row) => row.sku === "W-850")
      expect(w850).toMatchObject({ action: "overwrite", new_amount: "55.70", current: { amount: "50" } })
      // Already filled at the same rate: nothing to change.
      expect(rowsOf(preview, "eur").find((row: Row) => row.sku === "W-500")).toMatchObject({
        action: "skip",
        reason: "same_amount",
      })

      const body = { ...fill({ overwrite: true, currencies: ["eur"] }), fingerprint: preview.plan.fingerprint }
      const refused = await call("post", "/admin/currency/apply", body)
      expect(refused.status).toBe(400)
      expect(refused.data.message).toContain("Confirm overwriting")
      expect(Number(plainPrice(await pricesOf(drill.variants["W-850"].id), "eur").amount)).toBe(50)

      const saved = await call("post", "/admin/currency/apply", { ...body, confirm_overwrite: true })
      expect(saved.data).toMatchObject({ status: "saved", counts: { overwrite: 1, add: 0 } })
      const price = plainPrice(await pricesOf(drill.variants["W-850"].id), "eur")
      expect(Number(price.amount)).toBe(55.7)
      const run = await call("get", `/admin/currency/runs/${saved.data.run_id}`)
      expect(run.data.prices).toEqual([
        expect.objectContaining({ price_id: price.id, action: "overwrite", previous_amount: "50", amount: "55.70" }),
      ])
    })

    it("fills price lists from the list's own base price, only when asked", async () => {
      const without = (await call("post", "/admin/currency/preview", fill({ currencies: ["eur"] }))).data
      expect(rowsOf(without, "eur").some((row: Row) => row.price_list_id)).toBe(false)

      const preview = (await call("post", "/admin/currency/preview", fill({ currencies: ["eur"], price_lists: true })))
        .data
      const listed = rowsOf(preview, "eur").filter((row: Row) => row.price_list_id)
      expect(listed).toEqual([
        expect.objectContaining({
          price_list_title: "Black Friday",
          base_amount: "98.4",
          new_amount: "22.28",
          action: "add",
        }),
      ])
      const saved = await call("post", "/admin/currency/apply", {
        ...fill({ currencies: ["eur"], price_lists: true }),
        fingerprint: preview.plan.fingerprint,
      })
      // The list price and W-500's own EUR price.
      expect(saved.data.counts.add).toBe(2)
      const prices = await pricesOf(drill.variants["W-500"].id)
      expect(prices.find((p) => p.price_list_id === priceListId && p.currency_code === "eur")).toMatchObject({
        amount: 22.28,
      })
      expect(prices.find((p) => p.price_list_id === priceListId && p.currency_code === "pln")).toMatchObject({
        amount: 98.4,
      })
    })

    it("fills region prices for the target currency's regions, through net when chosen", async () => {
      await call("post", "/admin/currency/settings", {
        currencies: {
          eur: { enabled: true, mode: "api", marginPercent: "0", rounding: "none", tax: "net", taxCountry: "de" },
          czk: { enabled: false },
        },
      })
      const body = fill({ scope: { kind: "products", ids: [socket.id] }, region_prices: true })
      const preview = (await call("post", "/admin/currency/preview", body)).data
      expect(preview.targets.map((t: Row) => t.code)).toEqual(["eur"])
      const rows = rowsOf(preview, "eur")
      // 61.50 gross PLN → 50 net → 11.32 net EUR → 13.47 gross at DE 19 %.
      expect(rows.find((row: Row) => !row.region_id)).toMatchObject({
        new_amount: "13.47",
        tax: "net",
        tax_rates: { base: "23", target: "19" },
      })
      // Region price: Medusa makes region prices net unless the region says otherwise, so
      // 59.04 net PLN → 13.37 net EUR for the EU region, with no VAT step.
      expect(rows.find((row: Row) => row.region_id)).toMatchObject({
        region_id: euRegion,
        region_name: "Unia Europejska",
        base_amount: "59.04",
        new_amount: "13.37",
        tax: "none",
        action: "add",
      })
      const saved = await call("post", "/admin/currency/apply", { ...body, fingerprint: preview.plan.fingerprint })
      expect(saved.data.counts.add).toBe(2)
      const prices = await pricesOf(socket.variant.id)
      const regional = prices.find((p) => p.currency_code === "eur" && (p.price_rules ?? []).length) as Row
      expect(regional).toMatchObject({ amount: 13.37 })
      expect(regional.price_rules[0]).toMatchObject({ attribute: "region_id", value: euRegion })
    })

    it("suggests every other column of the price editor from a price typed in any one, writing nothing", async () => {
      const before = await pricesOf(drill.variants["W-500"].id)
      const response = await call("post", "/admin/currency/suggest", {
        rows: [
          { key: "variants.0.prices", slot: "eur", amount: "10" },
          { key: "variants.1.prices", slot: "usd", amount: "10" },
        ],
      })
      expect(response.status).toBe(200)
      const [eur, usd] = response.data.rows as Row[]
      const bySlot = Object.fromEntries((eur.suggestions as Row[]).map((s) => [s.slot, s]))
      // 10 EUR × 4.4165 = 44.165 PLN, gross as it is (DE 19 % → PL 23 %, noted).
      expect(bySlot.pln).toMatchObject({ ok: true, amount: "44.17", warnings: ["tax_differs"] })
      // CZK prices are net: 44.165 / 1.19 / 0.17 = 218.31 → whole units.
      expect(bySlot.czk).toMatchObject({ ok: true, amount: "218.00" })
      // The EU region's prices are net (Medusa's default for regions): same currency, VAT taken off.
      expect(bySlot[euRegion]).toMatchObject({ ok: true, currency: "eur", amount: "8.40" })
      expect(bySlot.eur).toBeUndefined()
      expect(usd).toMatchObject({ error: "unknown_slot", suggestions: [] })
      expect(await pricesOf(drill.variants["W-500"].id)).toEqual(before)
    })

    it("saves nothing when a base price or the rate changed after the preview", async () => {
      await call("post", "/admin/currency/settings", {
        currencies: { eur: { enabled: true, mode: "api", rounding: "none", tax: "gross" }, czk: { enabled: false } },
      })
      const body = fill({ currencies: ["eur"] })
      const first = (await call("post", "/admin/currency/preview", body)).data

      // A base price changes.
      const w500 = plainPrice(await pricesOf(drill.variants["W-500"].id), "pln")
      await pricing().addPrices({
        priceSetId: drill.variants["W-500"].price_set.id,
        prices: [{ id: w500.id, currency_code: "pln", amount: 130, rules: {} }],
      } as never)
      const changed = await call("post", "/admin/currency/apply", { ...body, fingerprint: first.plan.fingerprint })
      expect(changed.status).toBe(409)
      expect(changed.data.type).toBe("plan_changed")
      expect(rowsOf(changed.data.preview, "eur").find((row: Row) => row.sku === "W-500")).toMatchObject({
        base_amount: "130",
      })
      expect(plainPrice(await pricesOf(drill.variants["W-500"].id), "eur")).toBeUndefined()

      // A new NBP table arrives between preview and save.
      const second = changed.data.preview
      nbp.table = { no: "006/A/NBP/2026", date: "2026-01-09", eur: 4.5, usd: 4.1 }
      await call("get", "/admin/currency/rates?refresh=true")
      const stale = await call("post", "/admin/currency/apply", { ...body, fingerprint: second.plan.fingerprint })
      expect(stale.status).toBe(409)
      expect(rowsOf(stale.data.preview, "eur")[0].rate).toMatchObject({
        rate: "4.5",
        source: { table: "006/A/NBP/2026" },
      })

      // Saved as previewed: the amounts written are the ones shown.
      const third = stale.data.preview
      const saved = await call("post", "/admin/currency/apply", { ...body, fingerprint: third.plan.fingerprint })
      expect(saved.status).toBe(200)
      const shown = rowsOf(third, "eur").filter((row: Row) => row.action !== "skip")
      for (const row of shown) {
        const price = plainPrice(await pricesOf(row.variant_id), "eur")
        expect(String(price.raw_amount?.value ?? price.amount)).toBe(String(Number(row.new_amount)))
      }
    })

    it("offers the last saved table, marked with its date, when NBP does not answer", async () => {
      await call("get", "/admin/currency/rates?refresh=true")
      nbp.table = { no: "006/A/NBP/2026", date: "2026-01-09", eur: 4.5, usd: 4.1 }
      await call("get", "/admin/currency/rates?refresh=true")
      // NBP last confirmed that table two hours ago; it should have published newer ones since.
      const service = container.resolve<CurrencyModuleService>(CURRENCY_MODULE)
      for (const row of await service.listCurrencyRateTables({})) {
        await service.updateCurrencyRateTables({ id: row.id, checked_at: new Date(Date.now() - 2 * 3_600_000) })
      }
      nbp.down = true
      nbp.calls = 0
      const rates = await call("get", "/admin/currency/rates?refresh=true")
      // The saved table (9 Jan 2026) is long past its successor's due date: stale.
      expect(rates.data).toMatchObject({
        status: "stale",
        table: { date: "2026-01-09" },
        error: expect.stringContaining("NBP did not answer"),
      })
      expect(nbp.calls).toBeGreaterThan(0)

      const refused = (await call("post", "/admin/currency/preview", fill({ currencies: ["eur"] }))).data
      expect(refused.rates.status).toBe("stale")
      expect(rowsOf(refused, "eur").every((row: Row) => row.action === "skip")).toBe(true)
      expect(rowsOf(refused, "eur").find((row: Row) => row.sku === "W-500")?.reason).toBe("rates_unavailable")

      const allowed = (
        await call("post", "/admin/currency/preview", fill({ currencies: ["eur"], allow_stale: true, overwrite: true }))
      ).data
      expect(rowsOf(allowed, "eur").find((row: Row) => row.sku === "W-500")).toMatchObject({
        rate: { source: { date: "2026-01-09", stale: true } },
        warnings: expect.arrayContaining(["stale_rate"]),
      })
    })

    it("in demo mode previews sample products with sample rates, asks NBP nothing and writes no price", async () => {
      const service = container.resolve<CurrencyModuleService>(CURRENCY_MODULE)
      const options = await service.getOptions()
      const demoService = new Proxy(service, {
        get: (target, key) =>
          key === "getOptions" ? async () => ({ ...options, demo: true }) : Reflect.get(target, key, target),
      })
      const scope = container.createScope()
      scope.register(CURRENCY_MODULE, asValue(demoService))
      nbp.calls = 0

      const samples = await buildPreview(scope, { ...fill({ scope: { kind: "demo" }, currencies: ["eur"] }) } as never)
      expect(samples.demo).toBe(true)
      expect(samples.rates).toMatchObject({ status: "demo", table: { table: "DEMO/A/NBP" } })
      expect(samples.plan.rows.map((row) => row.reason)).toEqual(
        expect.arrayContaining(["already_set", "no_base_price", null])
      )

      const before = (await pricesOf(drill.variants["W-500"].id)).map((p) => [p.id, p.amount])
      const request = { ...fill({ currencies: ["eur"], overwrite: true }), confirm_overwrite: true }
      const preview = await buildPreview(scope, request as never)
      expect(preview.plan.counts.overwrite).toBeGreaterThan(0)
      const result = await applyFill(scope, { ...request, fingerprint: preview.plan.fingerprint } as never, null)
      expect(result).toMatchObject({ status: "saved", demo: true })
      expect((await pricesOf(drill.variants["W-500"].id)).map((p) => [p.id, p.amount])).toEqual(before)
      expect(nbp.calls).toBe(0)
      const [run] = await service.listCurrencyFillRuns({ id: (result as Row).run_id })
      expect(run).toMatchObject({ demo: true })
      expect(await service.listCurrencyFilledPrices({ run_id: run.id })).toHaveLength(0)
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(events).toEqual([])
    })
  },
})
