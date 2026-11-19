import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { CURRENCY_MODULE } from "../../src/modules/currency"
import type CurrencyModuleService from "../../src/modules/currency/service"

jest.setTimeout(120_000)

/** Runs against a real Postgres (see CI). Configure with DB_HOST, DB_USERNAME and DB_PASSWORD. */
moduleIntegrationTestRunner<CurrencyModuleService>({
  moduleName: CURRENCY_MODULE,
  resolve: path.join(__dirname, "../../src/modules/currency"),
  pathToMigrations: path.join(__dirname, "../../src/modules/currency/migrations"),
  moduleOptions: {},
  testSuite: ({ service, MikroOrmWrapper }) => {
    it("has a migration that matches the data models exactly", async () => {
      const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
      expect(diff.trim()).toBe("")
    })

    it("stores settings and falls back to defaults", async () => {
      expect((await service.getSettings()).currencies).toEqual({})
      await service.saveSettings({ baseCurrency: "pln", baseTaxCountry: "pl", currencies: {} })
      expect(await service.getSettings()).toMatchObject({ baseCurrency: "pln", baseTaxCountry: "pl" })
    })

    it("keeps one table per source and day, and returns the newest", async () => {
      const table = { provider: "nbp", table: "001/A/NBP/2026", date: "2026-01-02", base: "PLN", rates: { EUR: "4.2" } }
      await service.saveTable(table, new Date("2026-01-02T12:00:00Z"))
      await service.saveTable(
        { ...table, table: "002/A/NBP/2026", date: "2026-01-05" },
        new Date("2026-01-05T12:00:00Z")
      )
      await service.saveTable(
        { ...table, table: "002/A/NBP/2026", date: "2026-01-05" },
        new Date("2026-01-05T13:00:00Z")
      )
      expect(await service.listCurrencyRateTables({})).toHaveLength(2)
      expect(await service.latestTable("nbp")).toEqual({
        table: { ...table, table: "002/A/NBP/2026", date: "2026-01-05" },
        checked_at: new Date("2026-01-05T13:00:00Z"),
      })
      expect(await service.latestTable("ecb")).toBeNull()
    })

    it("finds the newest fill record of each price", async () => {
      const record = {
        run_id: "curfill_1",
        variant_id: "variant_1",
        product_id: "prod_1",
        currency_code: "eur",
        action: "add",
        base_amount: "100",
        mode: "api",
        margin: "0",
        table_no: "001/A/NBP/2026",
        rate_date: "2026-01-02",
      }
      await service.createCurrencyFilledPrices({ ...record, price_id: "price_1", amount: "23.81", rate: "4.2" })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await service.createCurrencyFilledPrices({
        ...record,
        price_id: "price_1",
        run_id: "curfill_2",
        amount: "24.00",
        rate: "4.1",
      })
      const found = await service.filledFor(["price_1", "price_2"])
      expect(Object.keys(found)).toEqual(["price_1"])
      expect(found.price_1).toMatchObject({ run_id: "curfill_2", amount: "24.00", rate: "4.1" })
    })
  },
})
