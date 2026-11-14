import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { COUPONS_MODULE } from "../../src/modules/coupons"
import type CouponsModuleService from "../../src/modules/coupons/service"

jest.setTimeout(120_000)

/** Runs against a real Postgres. Configure with DB_HOST, DB_PORT, DB_USERNAME and DB_PASSWORD. */
moduleIntegrationTestRunner<CouponsModuleService>({
  moduleName: COUPONS_MODULE,
  resolve: path.join(__dirname, "../../src/modules/coupons"),
  pathToMigrations: path.join(__dirname, "../../src/modules/coupons/migrations"),
  moduleOptions: {},
  testSuite: ({ service, MikroOrmWrapper }) => {
    describe("migration", () => {
      it("matches the data models exactly", async () => {
        const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
        expect(diff.trim()).toBe("")
      })
    })

    describe("coupons", () => {
      const row = (code: string) => ({
        code,
        kind: "percentage" as const,
        draft: { kind: "percentage", value: 10 },
      })

      it("keeps codes unique, but frees a code once its coupon is deleted", async () => {
        const first = await service.createCouponsCoupons(row("UNIQ10"))
        await expect(service.createCouponsCoupons(row("UNIQ10"))).rejects.toThrow()
        await service.softDeleteCouponsCoupons(first.id)
        await expect(service.createCouponsCoupons(row("UNIQ10"))).resolves.toMatchObject({ code: "UNIQ10" })
      })
    })

    describe("settings", () => {
      it("starts from the plugin options and keeps only saved changes on top", async () => {
        expect(await service.getSettings()).toEqual({ currencyCode: "pln", codeLength: 10, exportLocale: "pl" })
        expect(await service.saveSettings({ codeLength: 12 })).toEqual({
          currencyCode: "pln",
          codeLength: 12,
          exportLocale: "pl",
        })
        expect(await service.saveSettings({})).toEqual({ currencyCode: "pln", codeLength: 10, exportLocale: "pl" })
      })
    })
  },
})
