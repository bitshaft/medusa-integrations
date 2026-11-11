import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describeCopy, parseCopy } from "../api/utils"
import { DEFAULT_COPY, interpolate, resolveCopy, validateOverrides, variablesIn } from "../copy"
import { addressLines, createFormatters, maskEmail, toNumber } from "../format"
import { normalizeLocale, pickLocale } from "../locales"
import { addressOf, buildUrl, parseOptions, pluginOptionsSchema, resolveBrand } from "../options"
import { copyKeys, copyVariables, listDefinitions } from "../registry"
import { cleanRecipients, copyKey, GENERAL_KEY, mergeSettings, teamRecipients, typeKey } from "../settings"
import { BUILT_IN_TEMPLATES } from "../templates/built-in"
import { BUILT_IN_TYPES } from "../types"
import { BUILT_IN_LOADERS } from "../data/loaders"

const options = (extra: Record<string, unknown> = {}) =>
  pluginOptionsSchema.parse({ from: "orders@shop.test", ...extra })

describe("plugin options", () => {
  it("stays disabled instead of throwing when the sender is missing", () => {
    expect(parseOptions(undefined)).toEqual({ enabled: false, reason: "missing option from" })
    expect(parseOptions({ from: "  " })).toEqual({ enabled: false, reason: "missing option from" })
  })

  it("reports invalid options without echoing their values", () => {
    const result = parseOptions({ from: "not-an-address", brand: { colors: { primary: "red" } } })
    expect(result.enabled).toBe(false)
    const reason = (result as { reason: string }).reason
    expect(reason).toContain("invalid options: from:")
    expect(reason).toContain("brand.colors.primary")
    expect(reason).not.toContain("not-an-address")
  })

  it("accepts a plain address or a name with an address", () => {
    expect(parseOptions({ from: "orders@shop.test" }).enabled).toBe(true)
    expect(parseOptions({ from: "Sklep Ąę <orders@shop.test>" }).enabled).toBe(true)
    expect(addressOf("Sklep <orders@shop.test>")).toBe("orders@shop.test")
    expect(addressOf("orders@shop.test")).toBe("orders@shop.test")
  })

  it("has working defaults", () => {
    expect(options()).toMatchObject({
      channel: "email",
      demo: false,
      defaultLocale: "en",
      localeByCountry: { pl: "pl" },
      team: { recipients: [] },
      lowStock: { threshold: 5 },
      retries: { maxAttempts: 5 },
    })
  })

  describe("buildUrl", () => {
    const withUrls = options({ storefrontUrl: "https://shop.test/", adminUrl: "https://api.shop.test/app" })

    it("fills in and encodes the placeholders", () => {
      expect(buildUrl(withUrls, "order", { order_id: "order_1", country_code: "pl" })).toBe(
        "https://shop.test/pl/order/order_1/confirmed"
      )
      expect(buildUrl(withUrls, "passwordReset", { token: "a b&c", email: "a+b@example.com" })).toBe(
        "https://shop.test/reset-password?token=a%20b%26c&email=a%2Bb%40example.com"
      )
      expect(buildUrl(withUrls, "adminOrder", { order_id: "order_1" })).toBe("https://api.shop.test/app/orders/order_1")
    })

    it("returns nothing when a value is missing, so no broken link is sent", () => {
      expect(buildUrl(options(), "order", { order_id: "order_1", country_code: "pl" })).toBeUndefined()
      expect(buildUrl(withUrls, "order", { order_id: "order_1" })).toBeUndefined()
      expect(buildUrl(withUrls, "unknown")).toBeUndefined()
    })

    it("uses custom templates", () => {
      const custom = options({
        storefrontUrl: "https://shop.test",
        urls: { order: "{storefrontUrl}/{locale}/o/{display_id}" },
      })
      expect(buildUrl(custom, "order", { display_id: 1042, locale: "pl" })).toBe("https://shop.test/pl/o/1042")
    })
  })

  it("resolves the brand per language with fallbacks", () => {
    const brand = resolveBrand(
      options({
        replyTo: "help@shop.test",
        brand: { footerText: { pl: "Stopka" } },
        storefrontUrl: "https://shop.test",
      }),
      "pl",
      "Medusa Store"
    )
    expect(brand).toMatchObject({
      name: "Medusa Store",
      footerText: "Stopka",
      supportEmail: "help@shop.test",
      links: { website: "https://shop.test" },
    })
    expect(resolveBrand(options(), "en", null)).toMatchObject({ name: "Store", supportEmail: "orders@shop.test" })
    expect(resolveBrand(options({ brand: { name: "Acme" } }), "en", "Medusa Store").name).toBe("Acme")
  })
})

describe("locales and formatting", () => {
  it("normalises locale codes", () => {
    expect(normalizeLocale("pl-PL")).toBe("pl")
    expect(normalizeLocale("EN_us")).toBe("en")
    expect(normalizeLocale("de")).toBeUndefined()
    expect(normalizeLocale(null)).toBeUndefined()
    expect(pickLocale([undefined, "de", "pl"], "en")).toBe("pl")
    expect(pickLocale(["de"], "en")).toBe("en")
  })

  it("formats money, dates and addresses for the language", () => {
    const pl = createFormatters("pl", "UTC")
    expect(pl.money(1234.5, "pln")).toMatch(/1\s?234,50\szł/)
    expect(pl.money(null, "pln")).toBe("")
    expect(pl.money(10, "xx-invalid")).toContain("XX-INVALID")
    expect(pl.date("2026-11-10T09:30:00.000Z")).toBe("10 listopada 2026")
    expect(createFormatters("en", "UTC").date("2026-11-10T09:30:00.000Z")).toBe("10 November 2026")
    expect(pl.date("nonsense")).toBe("")

    expect(
      addressLines(
        {
          first_name: "Anna",
          last_name: "Nowak",
          address_1: "Lipowa 1",
          postal_code: "00-001",
          city: "Warszawa",
          country_code: "pl",
        },
        "en"
      )
    ).toEqual(["Anna Nowak", "Lipowa 1", "00-001 Warszawa", "Poland"])
    expect(addressLines(null, "en")).toEqual([])
  })

  it("reads numbers in every shape Medusa returns", () => {
    expect(toNumber(12.5)).toBe(12.5)
    expect(toNumber("12.5")).toBe(12.5)
    expect(toNumber({ value: "12.5" })).toBe(12.5)
    expect(toNumber({ numeric_: 3 })).toBe(3)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber("abc")).toBe(0)
  })

  it("masks addresses for logs", () => {
    expect(maskEmail("anna@example.com")).toBe("a***@example.com")
    expect(maskEmail("broken")).toBe("***")
  })
})

describe("copy", () => {
  it("has the same texts in English and Polish", () => {
    expect(Object.keys(DEFAULT_COPY.pl).sort()).toEqual(Object.keys(DEFAULT_COPY.en).sort())
    for (const group of Object.keys(DEFAULT_COPY.en)) {
      expect([group, Object.keys(DEFAULT_COPY.pl[group]).sort()]).toEqual([
        group,
        Object.keys(DEFAULT_COPY.en[group]).sort(),
      ])
    }
  })

  it("covers every built-in type with copy, a template and a loader", () => {
    for (const { type } of BUILT_IN_TYPES) {
      expect([type, typeof DEFAULT_COPY.en[type]?.subject]).toEqual([type, "string"])
      expect([type, typeof BUILT_IN_TEMPLATES[type]]).toEqual([type, "function"])
      expect([type, typeof BUILT_IN_LOADERS[type]]).toEqual([type, "function"])
    }
  })

  it("only uses variables its type provides", () => {
    const opts = options()
    for (const locale of ["en", "pl"] as const) {
      for (const [group, texts] of Object.entries(DEFAULT_COPY[locale])) {
        const allowed = copyVariables(opts, group)!
        for (const [key, text] of Object.entries(texts)) {
          const unknown = variablesIn(text).filter((name) => !allowed.includes(name))
          expect([locale, group, key, unknown]).toEqual([locale, group, key, []])
        }
      }
    }
  })

  it("interpolates known variables and leaves unknown ones visible", () => {
    expect(interpolate("Order {{ order_number }} for {{first_name}}", { order_number: 7, first_name: "Anna" })).toBe(
      "Order 7 for Anna"
    )
    expect(interpolate("Hi {{nope}}", {})).toBe("Hi {{nope}}")
  })

  it("layers defaults, custom template copy and admin edits", () => {
    const resolved = resolveCopy("welcome", "pl", {
      custom: { en: { subject: "Custom EN", extra: "Extra" }, pl: { subject: "Custom PL" } },
      overrides: { pl: { heading: "Edytowany", body: "   " } },
    })
    expect(resolved.subject).toBe("Custom PL")
    expect(resolved.extra).toBe("Extra")
    expect(resolved.heading).toBe("Edytowany")
    expect(resolved.body).toBe(DEFAULT_COPY.pl.welcome.body)
  })

  describe("validating admin edits", () => {
    const rules = { keys: ["subject", "body"], variables: ["first_name"] }
    const defaults = () => ({ subject: "Welcome", body: "Body" })

    it("keeps only real changes", () => {
      const { overrides, errors } = validateOverrides(
        { en: { subject: "Welcome", body: " New body for {{first_name}} " }, pl: { subject: "" } },
        rules,
        defaults
      )
      expect(errors).toEqual([])
      expect(overrides).toEqual({ en: { body: "New body for {{first_name}}" } })
    })

    it("rejects unknown fields, languages and variables, and overlong text", () => {
      const { overrides, errors } = validateOverrides(
        { en: { nope: "x", subject: "Hi {{order_number}}", body: "x".repeat(2001) }, de: { subject: "Hallo" } },
        rules,
        defaults
      )
      expect(overrides).toEqual({})
      expect(errors).toEqual([
        "en.nope: unknown field",
        "en.subject: unknown variable {{order_number}}; available: {{first_name}}",
        "en.body: longer than 2000 characters",
        '"de" is not a supported language (use en or pl)',
      ])
    })
  })

  it("describes a type for the editor and parses what the editor sends back", () => {
    const opts = options()
    const settings = mergeSettings(opts, [{ key: copyKey("welcome"), value: { en: { subject: "Hello there" } } }])
    const described = describeCopy(opts, settings, "welcome")

    expect(described.edited).toBe(true)
    expect(described.fields[0]).toEqual({ key: "subject", multiline: false })
    expect(described.fields.find((field) => field.key === "body")?.multiline).toBe(true)
    expect(described.copy.en.subject).toEqual({
      value: "Hello there",
      default: "Welcome to {{store_name}}",
      edited: true,
    })
    expect(described.copy.pl.subject.edited).toBe(false)

    expect(parseCopy(opts, "welcome", { en: { subject: "Welcome to {{store_name}}", heading: "Hi!" } })).toEqual({
      en: { heading: "Hi!" },
    })
    expect(() => parseCopy(opts, "welcome", { en: { subject: "{{token}}" } })).toThrow(/unknown variable \{\{token\}\}/)
  })
})

describe("registry and settings", () => {
  it("lists built-in and custom types with their default state", () => {
    const opts = options({
      disabledTypes: ["payment-received"],
      templates: {
        "abandoned-cart": { copy: { en: { subject: "Hi", coupon: "Code" } }, enabled: false, audience: "customer" },
      },
    })
    const definitions = listDefinitions(opts)
    expect(definitions).toHaveLength(BUILT_IN_TYPES.length + 1)
    expect(definitions.find((d) => d.type === "payment-received")?.defaultEnabled).toBe(false)
    expect(definitions.find((d) => d.type === "abandoned-cart")).toMatchObject({
      custom: true,
      defaultEnabled: false,
      variables: null,
    })
    expect(copyKeys(opts, "abandoned-cart")).toEqual(["subject", "coupon"])
  })

  it("merges admin settings over the plugin options", () => {
    const opts = options({ team: { recipients: ["default@shop.test"] }, lowStock: { threshold: 3 } })
    const defaults = mergeSettings(opts, [])
    expect(defaults).toMatchObject({
      team_recipients: ["default@shop.test"],
      team_recipients_overridden: false,
      low_stock_threshold: 3,
      low_stock_threshold_overridden: false,
    })
    expect(defaults.types["order-confirmation"]).toMatchObject({ enabled: true, enabled_overridden: false })

    const edited = mergeSettings(opts, [
      { key: GENERAL_KEY, value: { team_recipients: ["A@Shop.test", "a@shop.test", "nope"], low_stock_threshold: 0 } },
      { key: typeKey("team-low-stock"), value: { enabled: false, recipients: ["stock@shop.test"] } },
      { key: typeKey("welcome"), value: { recipients: ["ignored@shop.test"] } },
    ])
    expect(edited.team_recipients).toEqual(["a@shop.test"])
    expect(edited.low_stock_threshold).toBe(0)
    expect(edited.types["team-low-stock"]).toMatchObject({ enabled: false, enabled_overridden: true })
    expect(teamRecipients(edited, "team-low-stock")).toEqual(["stock@shop.test"])
    expect(teamRecipients(edited, "team-new-order")).toEqual(["a@shop.test"])
    // Only store team emails have recipients.
    expect(edited.types.welcome.recipients).toBeNull()
  })

  it("lets an admin clear the recipients on purpose", () => {
    const settings = mergeSettings(options({ team: { recipients: ["default@shop.test"] } }), [
      { key: GENERAL_KEY, value: { team_recipients: [] } },
    ])
    expect(settings.team_recipients).toEqual([])
    expect(settings.team_recipients_overridden).toBe(true)
    expect(cleanRecipients("nope")).toBeNull()
  })
})

describe("admin translations", () => {
  const read = (locale: string) =>
    JSON.parse(readFileSync(join(__dirname, `../../../admin/i18n/emails/${locale}.json`), "utf8")) as Record<
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
    expect(Object.keys(en)).toEqual(["emails"])
    expect(Object.keys(pl)).toEqual(["emails"])
    expect(flatten(pl).sort()).toEqual(flatten(en).sort())
  })

  it("names every built-in type and every editable field", () => {
    const en = read("en").emails as { types: Record<string, unknown>; copyKeys: Record<string, string> }
    for (const { type } of BUILT_IN_TYPES) {
      expect([type, typeof en.types[type]]).toEqual([type, "object"])
    }
    const keys = new Set(Object.values(DEFAULT_COPY.en).flatMap((group) => Object.keys(group)))
    for (const key of keys) {
      expect([key, typeof en.copyKeys[key]]).toEqual([key, "string"])
    }
  })
})
