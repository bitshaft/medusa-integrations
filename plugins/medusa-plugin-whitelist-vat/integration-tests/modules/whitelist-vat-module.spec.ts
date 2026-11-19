import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { startOfWarsawDay } from "../../src/lib/whitelist-vat/verify"
import { WHITELIST_VAT_MODULE } from "../../src/modules/whitelist-vat"
import type WhitelistVatModuleService from "../../src/modules/whitelist-vat/service"

jest.setTimeout(120_000)

const NIP = "5260250274"

/**
 * Runs against a real Postgres (see CI). Configure with DB_HOST,
 * DB_USERNAME and DB_PASSWORD. Every register is switched off, so nothing
 * leaves the machine.
 */
moduleIntegrationTestRunner<WhitelistVatModuleService>({
  moduleName: WHITELIST_VAT_MODULE,
  resolve: path.join(__dirname, "../../src/modules/whitelist-vat"),
  // Apply the shipped migration instead of generating the schema from models,
  // so the migration itself is under test.
  pathToMigrations: path.join(__dirname, "../../src/modules/whitelist-vat/migrations"),
  moduleOptions: { mf: { enabled: false }, vies: { enabled: false } },
  testSuite: ({ service, MikroOrmWrapper }) => {
    const subject = {
      number: NIP,
      kind: "nip" as const,
      country_code: "PL",
      status: "active" as const,
      name: "ACME SP. Z O.O.",
      address: "UL. LIPOWA 1, 00-001 WARSZAWA",
      company: { name: "ACME SP. Z O.O.", bank_accounts: ["61109010140000071219812874"] },
      sources: {
        mf: { outcome: "active" as const, request_id: "mf-1", checked_at: new Date().toISOString(), error: null },
      },
      bank_account_count: 1,
      customer_id: null,
      checked_at: new Date(),
    }
    const check = {
      number: NIP,
      source: "mf" as const,
      outcome: "active" as const,
      status: "active" as const,
      request_id: "mf-1",
      error: null,
      duration_ms: 120,
      from_cache: false,
      trigger_type: "order",
      name: "ACME SP. Z O.O.",
      order_id: "order_1",
      customer_id: "cus_1",
      cart_id: null,
      checked_at: new Date(),
    }

    describe("migration", () => {
      it("matches the data models exactly", async () => {
        const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
        expect(diff.trim()).toBe("")
      })
    })

    describe("subjects", () => {
      it("creates a business once and updates it afterwards", async () => {
        const created = await service.saveSubject(subject)
        expect(created).toMatchObject({ id: expect.stringMatching(/^wvsub_/), number: NIP, status: "active" })

        const updated = await service.saveSubject({ ...subject, status: "exempt", customer_id: "cus_1" })
        expect(updated.id).toBe(created.id)
        expect(await service.findSubject(NIP)).toMatchObject({
          status: "exempt",
          customer_id: "cus_1",
          company: { bank_accounts: ["61109010140000071219812874"] },
          sources: { mf: { outcome: "active", request_id: "mf-1" } },
        })
        expect(await service.listWhitelistVatSubjects({})).toHaveLength(1)
      })

      it("keeps one row when two verifications of a new number race", async () => {
        await Promise.all([service.saveSubject(subject), service.saveSubject({ ...subject, status: "exempt" })])
        expect(await service.listWhitelistVatSubjects({ number: NIP })).toHaveLength(1)
      })

      it("searches by number, name and address", async () => {
        await service.saveSubject(subject)
        for (const q of ["52602", "acme", "lipowa"]) {
          expect(await service.listWhitelistVatSubjects({ q })).toHaveLength(1)
        }
        expect(await service.listWhitelistVatSubjects({ q: "nothing" })).toHaveLength(0)
      })
    })

    describe("history", () => {
      it("counts only requests really sent to a register today", async () => {
        const yesterday = new Date(startOfWarsawDay(new Date()).getTime() - 60_000)
        await service.recordChecks([
          check,
          { ...check, order_id: "order_2" },
          // Reused answers and requests the plugin skipped itself cost no quota.
          { ...check, from_cache: true, duration_ms: null },
          { ...check, outcome: "unavailable", duration_ms: null },
          { ...check, checked_at: yesterday },
          { ...check, source: "gus" },
        ])
        expect(await service.countRequestsSince("mf", startOfWarsawDay(new Date()))).toBe(2)
        expect(await service.countRequestsSince("gus", startOfWarsawDay(new Date()))).toBe(1)
        expect(await service.listWhitelistVatChecks({ order_id: "order_2" })).toHaveLength(1)
      })

      it("filters checks the way the Guide's installation steps count them", async () => {
        await service.recordChecks([
          { ...check, outcome: "unavailable", order_id: null },
          { ...check, trigger_type: "checkout", order_id: null, cart_id: "cart_1" },
        ])
        const count = async (filters: Record<string, unknown>) =>
          (await service.listAndCountWhitelistVatChecks(filters, { take: 1, select: ["id"] }))[1]
        expect(await count({ outcome: { $ne: "unavailable" } })).toBe(1)
        expect(await count({ order_id: { $ne: null } })).toBe(0)
        expect(await count({ trigger_type: "checkout" })).toBe(1)
      })
    })

    describe("verify", () => {
      it("rejects a wrong check digit without any register", async () => {
        const result = await service.verify({ number: "5260250275", order_id: "order_1" })
        expect(result).toMatchObject({ status: "invalid", tax_id: { valid: false, problem: "checksum" } })
        expect(await service.listWhitelistVatChecks({ source: "local" })).toHaveLength(1)
      })

      it('answers "could not verify" when no register can be asked', async () => {
        const result = await service.verify({ number: NIP })
        expect(result).toMatchObject({ status: "unverified", could_not_verify: true, verified: false })
        expect(await service.findSubject(NIP)).toMatchObject({ status: "unverified", checked_at: null })
      })

      it("explains why a bank account cannot be checked", async () => {
        expect(await service.checkBankAccount("123", "61109010140000071219812874")).toMatchObject({
          assigned: null,
          problem: "invalid_nip",
        })
        expect(await service.checkBankAccount(NIP, "61109010140000071219812875")).toMatchObject({
          problem: "invalid_account",
        })
        expect(await service.checkBankAccount(NIP, "PL 61 1090 1014 0000 0712 1981 2874")).toMatchObject({
          problem: "unavailable",
          error: expect.stringContaining("mf.enabled"),
        })
      })
    })

    describe("options", () => {
      it("is enabled and lists the registers in use", async () => {
        expect(await service.isEnabled()).toBe(true)
        expect(await service.getActiveSources()).toEqual([])
      })
    })
  },
})
