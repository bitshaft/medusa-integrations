import { pluginOptionsSchema, type WhitelistVatPluginOptionsInput } from "../options"
import type { GusClient } from "../registers/gus"
import type { MfClient } from "../registers/mf"
import type { CompanyData, Outcome, RegisterResult, Source } from "../registers/types"
import type { ViesClient } from "../registers/vies"
import { decideStatus, mergeCompany, mergeSources, type SourceStates } from "../verdict"
import {
  type CheckRow,
  type Registers,
  startOfWarsawDay,
  type SubjectRecord,
  type VerificationStore,
  verifyTaxId,
} from "../verify"

const NIP = "5260250274"
let clock = Date.parse("2026-11-10T10:00:00.000Z")
const now = () => new Date(clock)
const hours = (count: number) => {
  clock += count * 3_600_000
}

const answer = (source: Source, outcome: Outcome, extra: Partial<RegisterResult> = {}): RegisterResult => ({
  source,
  outcome,
  request_id: outcome === "unavailable" ? null : `${source}-req-${clock}`,
  checked_at: now(),
  company: null,
  error: outcome === "unavailable" ? `${source} is down` : null,
  duration_ms: 120,
  ...extra,
})

const company: CompanyData = {
  name: "ACME SP. Z O.O.",
  address: "UL. LIPOWA 1, 00-001 WARSZAWA",
  street: "UL. LIPOWA 1",
  postal_code: "00-001",
  city: "WARSZAWA",
  regon: "011417295",
  bank_accounts: ["61109010140000071219812874"],
}

function setup(
  config: { options?: WhitelistVatPluginOptionsInput; mf?: jest.Mock; gus?: jest.Mock; vies?: jest.Mock } = {}
) {
  const subjects = new Map<string, SubjectRecord>()
  const checks: CheckRow[] = []
  const store: VerificationStore = {
    findSubject: async (number) => {
      const found = subjects.get(number)
      return found ? { ...found } : null
    },
    saveSubject: async (data) => {
      const saved = { ...data, id: subjects.get(data.number)?.id ?? `wvsub_${subjects.size + 1}` }
      subjects.set(data.number, saved)
      return { ...saved }
    },
    recordChecks: async (rows) => {
      checks.push(...rows)
    },
    countRequestsSince: async (source, since) =>
      checks.filter(
        (row) => row.source === source && !row.from_cache && row.duration_ms !== null && row.checked_at >= since
      ).length,
  }
  const registers: Registers = {
    mf: config.mf ? ({ searchNip: config.mf } as unknown as MfClient) : undefined,
    gus: config.gus ? ({ searchNip: config.gus } as unknown as GusClient) : undefined,
    vies: config.vies ? ({ check: config.vies } as unknown as ViesClient) : undefined,
  }
  const options = pluginOptionsSchema.parse(config.options ?? {})
  const verify = (input: Parameters<typeof verifyTaxId>[1]) => verifyTaxId({ store, registers, options, now }, input)
  return { verify, subjects, checks }
}

beforeEach(() => {
  clock = Date.parse("2026-11-10T10:00:00.000Z")
})

describe("verifyTaxId", () => {
  it("verifies a Polish NIP on the white list and stores the business", async () => {
    const mf = jest.fn(async () => answer("mf", "active", { company }))
    const { verify, subjects, checks } = setup({ mf })
    const result = await verify({ number: "PL 526-025-02-74", customer_id: "cus_1", trigger: "admin" })

    expect(mf).toHaveBeenCalledWith(NIP)
    expect(result).toMatchObject({
      tax_id: { number: NIP, kind: "nip", country_code: "PL", valid: true },
      status: "active",
      verified: true,
      could_not_verify: false,
      company: { name: "ACME SP. Z O.O.", postal_code: "00-001" },
      from_cache: false,
      stale: false,
      checked_at: now().toISOString(),
    })
    expect(subjects.get(NIP)).toMatchObject({
      status: "active",
      name: "ACME SP. Z O.O.",
      bank_account_count: 1,
      customer_id: "cus_1",
    })
    expect(checks).toEqual([
      expect.objectContaining({
        number: NIP,
        source: "mf",
        outcome: "active",
        status: "active",
        from_cache: false,
        trigger_type: "admin",
        customer_id: "cus_1",
        request_id: expect.stringContaining("mf-req-"),
      }),
    ])
  })

  it("stops at the check digit without asking any register", async () => {
    const mf = jest.fn()
    const { verify, subjects, checks } = setup({ mf })
    const result = await verify({ number: "5260250275" })

    expect(mf).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: "invalid",
      verified: false,
      could_not_verify: false,
      tax_id: { valid: false, problem: "checksum" },
      subject_id: null,
    })
    expect(subjects.size).toBe(0)
    expect(checks).toHaveLength(0)
  })

  it("keeps a wrong number in the history of the order it came with", async () => {
    const { verify, checks } = setup({ mf: jest.fn() })
    await verify({ number: "5260250275", order_id: "order_1", trigger: "order" })
    expect(checks).toEqual([
      expect.objectContaining({
        source: "local",
        outcome: "invalid",
        order_id: "order_1",
        error: expect.stringContaining("check digit"),
      }),
    ])
  })

  describe("when registers are down", () => {
    it('answers "could not verify", never "invalid"', async () => {
      const { verify, subjects } = setup({
        mf: jest.fn(async () => answer("mf", "unavailable")),
        gus: jest.fn(async () => answer("gus", "unavailable")),
      })
      const result = await verify({ number: NIP })
      expect(result).toMatchObject({ status: "unverified", verified: false, could_not_verify: true, checked_at: null })
      expect(subjects.get(NIP)?.checked_at).toBeNull()
    })

    it("does the same for VIES", async () => {
      const { verify } = setup({ vies: jest.fn(async () => answer("vies", "unavailable")) })
      expect(await verify({ number: "DE123456789" })).toMatchObject({ status: "unverified", could_not_verify: true })
    })

    it("survives a register client that throws", async () => {
      const { verify } = setup({
        mf: jest.fn(async () => {
          throw new Error("bug")
        }),
      })
      expect(await verify({ number: NIP })).toMatchObject({ status: "unverified", could_not_verify: true })
    })

    it("asks again next time instead of caching the failure", async () => {
      const mf = jest.fn().mockResolvedValueOnce(answer("mf", "unavailable")).mockResolvedValue(answer("mf", "active"))
      const { verify } = setup({ mf })
      await verify({ number: NIP })
      const second = await verify({ number: NIP })
      expect(mf).toHaveBeenCalledTimes(2)
      expect(second).toMatchObject({ status: "active", from_cache: false })
    })

    it("keeps an earlier answer when a refresh fails, and says it is stale", async () => {
      const mf = jest
        .fn()
        .mockResolvedValueOnce(answer("mf", "active", { company }))
        .mockResolvedValue(answer("mf", "unavailable"))
      const { verify, subjects } = setup({ mf })
      const first = await verify({ number: NIP })
      hours(30)
      const second = await verify({ number: NIP })

      expect(second).toMatchObject({
        status: "active",
        verified: true,
        could_not_verify: false,
        stale: true,
        checked_at: first.checked_at,
        company: { name: "ACME SP. Z O.O." },
      })
      expect(subjects.get(NIP)?.sources?.mf).toMatchObject({ outcome: "active" })
    })
  })

  describe("cache", () => {
    it("reuses a recent answer and asks again after it expires", async () => {
      const mf = jest.fn(async () => answer("mf", "active", { company }))
      const { verify } = setup({ mf })
      await verify({ number: NIP })
      hours(23)
      expect(await verify({ number: NIP })).toMatchObject({ status: "active", from_cache: true })
      expect(mf).toHaveBeenCalledTimes(1)
      hours(2)
      expect(await verify({ number: NIP })).toMatchObject({ from_cache: false })
      expect(mf).toHaveBeenCalledTimes(2)
    })

    it("asks the registers when forced", async () => {
      const mf = jest.fn(async () => answer("mf", "active"))
      const { verify } = setup({ mf })
      await verify({ number: NIP })
      await verify({ number: NIP, force: true })
      expect(mf).toHaveBeenCalledTimes(2)
    })

    it("gives an order its own proof rows pointing at the reused answer", async () => {
      const mf = jest.fn(async () => answer("mf", "active", { company }))
      const gus = jest.fn(async () => answer("gus", "unavailable"))
      const { verify, checks, subjects } = setup({ mf, gus })
      await verify({ number: NIP })
      const original = checks.find((row) => row.source === "mf")!
      hours(1)
      await verify({ number: NIP, order_id: "order_1", customer_id: "cus_9", trigger: "order" })

      const reused = checks.filter((row) => row.order_id === "order_1")
      expect(reused).toEqual([
        expect.objectContaining({
          source: "mf",
          outcome: "active",
          from_cache: true,
          request_id: original.request_id,
          checked_at: original.checked_at,
          duration_ms: null,
        }),
      ])
      expect(subjects.get(NIP)?.customer_id).toBe("cus_9")
    })
  })

  describe("daily white list limit", () => {
    it("stops asking the white list once the limit is used up and falls back to GUS", async () => {
      const mf = jest.fn(async () => answer("mf", "active"))
      const gus = jest.fn(async () => answer("gus", "found", { company }))
      const { verify, checks } = setup({ options: { mf: { dailyLimit: 2 } }, mf, gus })

      await verify({ number: NIP, force: true })
      await verify({ number: NIP, force: true })
      const third = await verify({ number: "5261040567" })

      expect(mf).toHaveBeenCalledTimes(2)
      expect(gus).toHaveBeenCalledTimes(3)
      // GUS knows the business; its VAT status is unknown, so not a verdict either way.
      expect(third).toMatchObject({
        status: "unverified",
        could_not_verify: true,
        company: { name: "ACME SP. Z O.O." },
      })
      const skipped = checks.find((row) => row.number === "5261040567" && row.source === "mf")
      expect(skipped).toMatchObject({
        outcome: "unavailable",
        duration_ms: null,
        error: expect.stringContaining("daily limit of 2"),
      })
    })

    it("counts per Polish calendar day", async () => {
      const mf = jest.fn(async () => answer("mf", "active"))
      const { verify } = setup({ options: { mf: { dailyLimit: 1 } }, mf })
      await verify({ number: NIP, force: true })
      hours(20) // 06:00 UTC the next day
      await verify({ number: NIP, force: true })
      expect(mf).toHaveBeenCalledTimes(2)
    })

    it("finds midnight in Poland in winter and summer", () => {
      expect(startOfWarsawDay(new Date("2026-11-10T23:30:00.000Z")).toISOString()).toBe("2026-11-10T23:00:00.000Z")
      expect(startOfWarsawDay(new Date("2026-11-10T10:00:00.000Z")).toISOString()).toBe("2026-11-09T23:00:00.000Z")
      expect(startOfWarsawDay(new Date("2026-07-01T10:00:00.000Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z")
    })
  })

  describe("EU VAT numbers", () => {
    it("asks VIES only, with the number split from its prefix", async () => {
      const mf = jest.fn()
      const vies = jest.fn(async () => answer("vies", "valid", { company: { name: "ACME GMBH", address: "BERLIN" } }))
      const { verify, subjects } = setup({ mf, vies })
      const result = await verify({ number: "de 123 456 789" })

      expect(mf).not.toHaveBeenCalled()
      expect(vies).toHaveBeenCalledWith("DE", "123456789")
      expect(result).toMatchObject({
        status: "valid",
        verified: true,
        tax_id: { number: "DE123456789", kind: "eu_vat" },
      })
      expect(subjects.get("DE123456789")).toMatchObject({ kind: "eu_vat", country_code: "DE", name: "ACME GMBH" })
    })

    it("uses the billing country for numbers without a prefix", async () => {
      const vies = jest.fn(async () => answer("vies", "invalid"))
      const { verify } = setup({ vies })
      const result = await verify({ number: "123456789", country_code: "de" })
      expect(vies).toHaveBeenCalledWith("DE", "123456789")
      expect(result).toMatchObject({ status: "invalid", verified: false, could_not_verify: false })
    })

    it("cannot verify when VIES is switched off", async () => {
      const { verify } = setup({})
      expect(await verify({ number: "DE123456789" })).toMatchObject({ status: "unverified", could_not_verify: true })
    })
  })
})

describe("decideStatus", () => {
  const states = (entries: Partial<Record<Source, Outcome>>): SourceStates =>
    Object.fromEntries(
      Object.entries(entries).map(([source, outcome]) => [
        source,
        { outcome, request_id: null, checked_at: now().toISOString(), error: null },
      ])
    )

  it.each([
    [{ mf: "active" }, "active"],
    [{ mf: "exempt" }, "exempt"],
    [{ mf: "unregistered" }, "unregistered"],
    [{ mf: "not_found" }, "not_found"],
    [{ mf: "active", gus: "found" }, "active"],
    [{ mf: "active", gus: "unavailable" }, "active"],
    [{ mf: "active", gus: "inactive" }, "inactive"],
    [{ mf: "not_found", gus: "found" }, "unregistered"],
    [{ mf: "not_found", gus: "inactive" }, "inactive"],
    [{ mf: "not_found", gus: "not_found" }, "not_found"],
    [{ mf: "unavailable", gus: "found" }, "unverified"],
    [{ mf: "unavailable", gus: "not_found" }, "not_found"],
    [{ mf: "unavailable", gus: "unavailable" }, "unverified"],
    [{ vies: "valid" }, "valid"],
    [{ vies: "invalid" }, "invalid"],
    [{ vies: "unavailable" }, "unverified"],
    [{}, "unverified"],
  ] as Array<[Partial<Record<Source, Outcome>>, string]>)("%j → %s", (entries, expected) => {
    expect(decideStatus(states(entries))).toBe(expected)
  })
})

describe("merging answers", () => {
  it("does not let an outage erase what a register said before", () => {
    const previous = mergeSources({}, [answer("mf", "active"), answer("gus", "unavailable")])
    const merged = mergeSources(previous, [answer("mf", "unavailable"), answer("gus", "found")])
    expect(merged.mf?.outcome).toBe("active")
    expect(merged.gus?.outcome).toBe("found")
    // An outage is recorded when there is nothing better.
    expect(mergeSources({}, [answer("mf", "unavailable")]).mf).toMatchObject({
      outcome: "unavailable",
      error: "mf is down",
    })
  })

  it("takes company data from the most authoritative register per field", () => {
    const merged = mergeCompany(null, [
      answer("gus", "found", {
        company: {
          name: "Acme",
          address: "ul. Lipowa 1, 00-001 Warszawa",
          street: "ul. Lipowa 1",
          postal_code: "00-001",
          city: "Warszawa",
          legal_form: "legal_entity",
          regon: "011417295",
        },
      }),
      answer("mf", "active", {
        company: {
          name: "ACME SP. Z O.O.",
          address: "LIPOWA 1 WARSZAWA",
          krs: "0000123456",
          bank_accounts: ["61109010140000071219812874"],
        },
      }),
    ])
    expect(merged).toMatchObject({
      name: "ACME SP. Z O.O.",
      address: "LIPOWA 1 WARSZAWA",
      // The white list line could not be split, so the structured address is GUS's.
      street: "ul. Lipowa 1",
      postal_code: "00-001",
      city: "Warszawa",
      krs: "0000123456",
      regon: "011417295",
      legal_form: "legal_entity",
      bank_accounts: ["61109010140000071219812874"],
    })
  })

  it("keeps earlier company data when nothing new arrives", () => {
    expect(mergeCompany(company, [answer("mf", "unavailable")])).toMatchObject({
      name: "ACME SP. Z O.O.",
      bank_accounts: company.bank_accounts,
    })
    expect(mergeCompany(null, [answer("mf", "not_found")])).toBeNull()
  })
})
