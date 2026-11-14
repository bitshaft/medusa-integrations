import path from "node:path"

import type { IPricingModuleService, IPromotionModuleService, MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { GET as storeVariantOmnibus } from "../../src/api/store/compliance/omnibus/variants/[id]/route"
import { omnibusFor, recordPrices } from "../../src/lib/compliance/server/prices"
import { COMPLIANCE_MODULE } from "../../src/modules/compliance"
import type ComplianceModuleService from "../../src/modules/compliance/service"

jest.setTimeout(180_000)

type Row = Record<string, any>
const DAY = 86_400_000

/**
 * Omnibus price recording against the real Pricing and Promotion modules:
 * a sale price list and an automatic promotion become discounts, the lowest
 * prior price is computed from the stored history, and the Store API
 * answers with it. Products, variants and regions come from other modules;
 * here they are fixtures behind `query.graph`.
 */
moduleIntegrationTestRunner<ComplianceModuleService>({
  moduleName: COMPLIANCE_MODULE,
  resolve: path.resolve(__dirname, "../../src/modules/compliance"),
  pathToMigrations: path.join(__dirname, "../../src/modules/compliance/migrations"),
  testSuite: ({ service: compliance }) => {
    moduleIntegrationTestRunner<IPricingModuleService>({
      moduleName: Modules.PRICING,
      resolve: path.dirname(require.resolve("@medusajs/pricing/package.json")),
      testSuite: ({ service: pricing }) => {
        moduleIntegrationTestRunner<IPromotionModuleService>({
          moduleName: Modules.PROMOTION,
          resolve: path.dirname(require.resolve("@medusajs/promotion/package.json")),
          testSuite: ({ service: promotion }) => {
            let priceSetId: string
            let container: MedusaContainer

            const variant = (priceSet: string) => ({
              id: "variant_1",
              created_at: new Date(Date.now() - 400 * DAY).toISOString(),
              product_id: "prod_1",
              price_set: { id: priceSet },
              product: {
                id: "prod_1",
                title: "Czajnik",
                status: "published",
                collection_id: null,
                type_id: null,
                categories: [{ id: "pcat_kitchen" }],
                tags: [],
              },
            })

            beforeEach(async () => {
              const [set] = await pricing.createPriceSets([{ prices: [{ amount: 100, currency_code: "pln" }] }])
              priceSetId = set.id
              const data: Record<string, Row[]> = {
                region: [
                  {
                    id: "reg_pl",
                    name: "Polska",
                    currency_code: "pln",
                    automatic_taxes: true,
                    countries: [{ iso_2: "pl" }],
                  },
                ],
                product_variant: [variant(priceSetId)],
                product: [{ id: "prod_1", status: "published", variants: [{ id: "variant_1" }] }],
                price_set: [{ id: priceSetId, variant: { id: "variant_1" } }],
              }
              const graph = async ({ entity, filters }: Row) => {
                const rows = (data[entity] ?? []).filter((row) =>
                  Object.entries(filters ?? {}).every(([key, value]) =>
                    Array.isArray(value) ? value.includes(row[key]) : row[key] === value
                  )
                )
                return { data: rows, metadata: { count: rows.length } }
              }
              const services: Record<string, unknown> = {
                [COMPLIANCE_MODULE]: compliance,
                [Modules.PRICING]: pricing,
                [Modules.PROMOTION]: promotion,
                // 23% VAT in Poland for every product.
                [Modules.TAX]: {
                  getTaxLines: async (items: Row[]) => items.map((i) => ({ line_item_id: i.id, rate: 23 })),
                },
                query: { graph },
                logger: { info() {}, warn() {}, error() {}, debug() {} },
                event_bus: { emit: async () => {} },
              }
              container = {
                resolve: (key: string) => {
                  if (!(key in services)) throw new Error(`unexpected resolve ${key}`)
                  return services[key]
                },
              } as unknown as MedusaContainer
            })

            async function startHistory(daysAgo: number) {
              await recordPrices(container, { source: "job", at: new Date(Date.now() - daysAgo * DAY) })
            }

            it("takes a snapshot first, with tax, and records only changes", async () => {
              await startHistory(60)
              const rows = await compliance.priceHistory(["variant_1"])
              expect(rows).toHaveLength(1)
              expect(rows[0]).toMatchObject({
                amount: 123,
                regular_amount: 123,
                discounted: false,
                source: "snapshot",
                series_start: true,
                start_known: false,
              })
              expect(await recordPrices(container, { source: "job" })).toHaveLength(0)
            })

            it("records a sale price list as a discount and finds the lowest prior price", async () => {
              await startHistory(60)
              const [list] = await pricing.createPriceLists([
                {
                  title: "Black Week",
                  description: "",
                  type: "sale",
                  status: "active",
                  prices: [{ amount: 80, currency_code: "pln", price_set_id: priceSetId }],
                },
              ])
              const recorded = await recordPrices(container, { source: "change" })
              expect(recorded).toHaveLength(1)
              expect(recorded[0]).toMatchObject({
                amount: 98.4,
                regular_amount: 123,
                discounted: true,
                discount_kind: "price_list",
                discount_ref: list.id,
              })

              const [omnibus] = await omnibusFor(container, ["variant_1"], { region_id: "reg_pl" })
              expect(omnibus).toMatchObject({
                discounted: true,
                amount: 98.4,
                regular: 123,
                lowest: 123,
                history_incomplete: false,
                kind: "price_list",
              })
            })

            it("marks the lowest price as incomplete right after installation", async () => {
              await startHistory(5)
              await pricing.createPriceLists([
                {
                  title: "Sale",
                  description: "",
                  type: "sale",
                  status: "active",
                  prices: [{ amount: 90, currency_code: "pln", price_set_id: priceSetId }],
                },
              ])
              await recordPrices(container, { source: "change" })
              const [omnibus] = await omnibusFor(container, ["variant_1"])
              expect(omnibus).toMatchObject({ discounted: true, lowest: 123, history_incomplete: true })
            })

            it("does not treat an override price list as a discount", async () => {
              await startHistory(60)
              await pricing.createPriceLists([
                {
                  title: "B2B",
                  description: "",
                  type: "override",
                  status: "active",
                  prices: [{ amount: 90, currency_code: "pln", price_set_id: priceSetId }],
                },
              ])
              const [row] = await recordPrices(container, { source: "change" })
              expect(row).toMatchObject({ amount: 110.7, regular_amount: 110.7, discounted: false })
            })

            it("records an automatic promotion without conditions and ignores one with conditions", async () => {
              await startHistory(60)
              await promotion.createPromotions([
                {
                  code: "AUTO10",
                  type: "standard",
                  status: "active",
                  is_automatic: true,
                  application_method: {
                    type: "percentage",
                    target_type: "items",
                    allocation: "each",
                    value: 10,
                    max_quantity: 1,
                    target_rules: [{ attribute: "items.product.id", operator: "eq", values: ["prod_1"] }],
                  },
                },
                {
                  code: "VIP50",
                  type: "standard",
                  status: "active",
                  is_automatic: true,
                  rules: [{ attribute: "customer.groups.id", operator: "in", values: ["cusgroup_vip"] }],
                  application_method: {
                    type: "percentage",
                    target_type: "items",
                    allocation: "each",
                    value: 50,
                    max_quantity: 1,
                    target_rules: [{ attribute: "items.product.id", operator: "eq", values: ["prod_1"] }],
                  },
                },
              ] as never)
              const [row] = await recordPrices(container, { source: "change" })
              expect(row).toMatchObject({
                amount: 110.7,
                regular_amount: 123,
                discounted: true,
                discount_kind: "promotion",
              })
            })

            it("skips promotion codes unless the settings count them", async () => {
              await startHistory(60)
              await promotion.createPromotions([
                {
                  code: "KOD20",
                  type: "standard",
                  status: "active",
                  is_automatic: false,
                  application_method: {
                    type: "percentage",
                    target_type: "items",
                    allocation: "each",
                    value: 20,
                    max_quantity: 1,
                    target_rules: [{ attribute: "items.product.id", operator: "eq", values: ["prod_1"] }],
                  },
                },
              ] as never)
              expect(await recordPrices(container, { source: "change" })).toHaveLength(0)

              await compliance.saveSettings({ omnibus: { code_promotions: true } })
              const [row] = await recordPrices(container, { source: "change" })
              expect(row).toMatchObject({ amount: 98.4, discounted: true, discount_kind: "promotion" })
            })

            it("answers the Store API with the lowest price, formatted for Polish", async () => {
              await startHistory(60)
              await pricing.createPriceLists([
                {
                  title: "Sale",
                  description: "",
                  type: "sale",
                  status: "active",
                  prices: [{ amount: 80, currency_code: "pln", price_set_id: priceSetId }],
                },
              ])
              await recordPrices(container, { source: "change" })

              let body: Row = {}
              let status = 200
              const res = {
                json: (value: Row) => void (body = value),
                status: (code: number) => ((status = code), res),
              }
              const req = (query: Row) => ({
                scope: container,
                params: { id: "variant_1" },
                validatedQuery: query,
                query,
                body: {},
                get: () => undefined,
              })
              await storeVariantOmnibus(req({ region_id: "reg_pl", locale: "pl" }) as never, res as never)
              expect(status).toBe(200)
              expect(body.omnibus).toMatchObject({
                known: true,
                price: 98.4,
                regular_price: 123,
                discounted: true,
                lowest_price: 123,
                period_days: 30,
                history_incomplete: false,
                exempt: false,
              })
              expect(body.omnibus.formatted.lowest_price.replace(/\s/g, " ")).toBe("123,00 zł")
              expect(body.omnibus.formatted.price.replace(/\s/g, " ")).toBe("98,40 zł")

              await storeVariantOmnibus(req({ locale: "en" }) as never, res as never)
              expect(status).toBe(400)
              expect(body).toMatchObject({
                code: "region_required",
                message: "Send the region (region_id) to show the price with tax.",
              })
            })

            it("hides the lowest price for exempt categories", async () => {
              await startHistory(60)
              await compliance.saveSettings({
                omnibus: { exceptions: [{ target: "category", id: "pcat_kitchen", rule: "exempt" }] },
              })
              await pricing.createPriceLists([
                {
                  title: "Sale",
                  description: "",
                  type: "sale",
                  status: "active",
                  prices: [{ amount: 80, currency_code: "pln", price_set_id: priceSetId }],
                },
              ])
              await recordPrices(container, { source: "change" })
              const [omnibus] = await omnibusFor(container, ["variant_1"])
              expect(omnibus).toMatchObject({ exempt: true, discounted: false, lowest: null })
            })

            it("refuses to change or delete a price record", async () => {
              await startHistory(60)
              const [row] = await compliance.priceHistory(["variant_1"])
              await expect(compliance.deleteCompliancePriceRecords(row.id)).rejects.toThrow(
                /cannot be changed or deleted/
              )
            })
          },
        })
      },
    })
  },
})
