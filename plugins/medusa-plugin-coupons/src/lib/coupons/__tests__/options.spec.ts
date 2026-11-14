import { normalizeLocale, parseOptions } from "../options"

describe("plugin options", () => {
  it("runs with no options at all, with every default filled in", () => {
    expect(parseOptions(undefined)).toEqual({
      enabled: true,
      options: {
        timeZone: "Europe/Warsaw",
        defaultLocale: "pl",
        maxBatchSize: 5000,
        checkRateLimitPerMinute: 20,
        settings: { currencyCode: "pln", codeLength: 10, exportLocale: "pl" },
      },
    })
  })

  it("fills inner defaults when only some settings are given", () => {
    const parsed = parseOptions({ settings: { currencyCode: "EUR" } })
    expect(parsed.enabled && parsed.options.settings).toEqual({
      currencyCode: "eur",
      codeLength: 10,
      exportLocale: "pl",
    })
  })

  it("stays disabled with a one-line reason instead of throwing on bad options", () => {
    const parsed = parseOptions({ timeZone: "Mars/Olympus", maxBatchSize: 0 })
    expect(parsed.enabled).toBe(false)
    if (!parsed.enabled) {
      expect(parsed.reason).toMatch(/^invalid options: /)
      expect(parsed.reason).toContain("timeZone")
      expect(parsed.reason).toContain("maxBatchSize")
      expect(parsed.reason).not.toContain("Mars")
    }
  })

  it("normalizes locales", () => {
    expect(normalizeLocale("pl-PL", "en")).toBe("pl")
    expect(normalizeLocale("EN", "pl")).toBe("en")
    expect(normalizeLocale("de", "pl")).toBe("pl")
    expect(normalizeLocale(undefined, "en")).toBe("en")
  })
})
