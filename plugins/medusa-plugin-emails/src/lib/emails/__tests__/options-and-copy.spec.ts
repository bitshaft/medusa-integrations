import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describeCommon, describeCopy, describeType, localeParam, mergeHidden, parseCopy } from "../api/utils"
import {
  copyDefaults,
  DEFAULT_COPY,
  interpolate,
  missingFields,
  ownDefaults,
  resolveCopy,
  validateOverrides,
  variablesIn,
} from "../copy"
import { addressLines, createFormatters, maskEmail, toNumber } from "../format"
import { loadLanguages } from "../languages"
import { canonicalLocale, intlLocale, languageOf, localizedValue, matchLocale, pickLocale } from "../locales"
import { addressOf, buildUrl, parseOptions, pluginOptionsSchema, resolveBrand } from "../options"
import { copyKeys, copyVariables, listDefinitions } from "../registry"
import { cleanRecipients, copyKey, GENERAL_KEY, mergeSettings, teamRecipients, typeKey } from "../settings"
import { BUILT_IN_TEMPLATES } from "../templates/built-in"
import { BUILT_IN_TYPES } from "../types"
import { BUILT_IN_LOADERS } from "../data/loaders"
import { createTestContainer } from "./fixtures"

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

    it("puts the language in {locale} and the full code in {locale_code}", () => {
      const custom = options({
        storefrontUrl: "https://shop.test",
        urls: { store: "{storefrontUrl}/{locale}?lang={locale_code}" },
      })
      expect(buildUrl(custom, "store", { locale: "en-US" })).toBe("https://shop.test/en?lang=en-US")
      expect(buildUrl(custom, "store", { locale: "pl" })).toBe("https://shop.test/pl?lang=pl")
      expect(buildUrl(custom, "store")).toBeUndefined()
    })
  })

  it("accepts any language tag as the base and for countries, in canonical form", () => {
    expect(options({ defaultLocale: "pl_pl", localeByCountry: { de: "de-de" } })).toMatchObject({
      defaultLocale: "pl-PL",
      localeByCountry: { de: "de-DE" },
    })
    const invalid = parseOptions({ from: "orders@shop.test", defaultLocale: "not a tag" })
    expect(invalid.enabled).toBe(false)
    expect((invalid as { reason: string }).reason).toContain("defaultLocale")
    expect(parseOptions({ from: "orders@shop.test", brand: { footerText: { "??": "x" } } }).enabled).toBe(false)
  })

  it("picks the footer text by language, falling back to the base", () => {
    const withFooter = options({
      defaultLocale: "pl-PL",
      brand: { footerText: { "pl-PL": "Stopka", en: "Footer" } },
    })
    expect(resolveBrand(withFooter, "en-US", null).footerText).toBe("Footer")
    expect(resolveBrand(withFooter, "de-DE", null).footerText).toBe("Stopka")
    expect(resolveBrand(withFooter, "pl-PL", null).footerText).toBe("Stopka")
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
  const store = (base: string, ...others: string[]) => ({ base, locales: [base, ...others], translation: true })

  it("canonicalises language tags and rejects anything else", () => {
    expect(canonicalLocale("pl-PL")).toBe("pl-PL")
    expect(canonicalLocale(" en_us ")).toBe("en-US")
    expect(canonicalLocale("DE")).toBe("de")
    expect(canonicalLocale("not a tag")).toBeUndefined()
    expect(canonicalLocale("")).toBeUndefined()
    expect(canonicalLocale(null)).toBeUndefined()
    expect(languageOf("pl-PL")).toBe("pl")
    expect(languageOf("EN")).toBe("en")
  })

  it("matches a candidate to the store's languages: same code, then same language", () => {
    const locales = ["pl-PL", "en-US", "en-GB", "de-DE"]
    expect(matchLocale("en-GB", locales)).toBe("en-GB")
    expect(matchLocale("en_gb", locales)).toBe("en-GB")
    expect(matchLocale("en", locales)).toBe("en-US")
    expect(matchLocale("en-AU", locales)).toBe("en-US")
    expect(matchLocale("de", locales)).toBe("de-DE")
    expect(matchLocale("fr-FR", locales)).toBeUndefined()
    expect(matchLocale(undefined, locales)).toBeUndefined()
    // A bare language key wins over another region (texts kept as `{ en, pl }`).
    expect(matchLocale("en-US", ["en-GB", "en"])).toBe("en")
  })

  it("picks the first candidate the store has, else the base", () => {
    expect(pickLocale([undefined, "fr", "de-AT", "en"], store("pl-PL", "en-US", "de-DE"))).toBe("de-DE")
    expect(pickLocale(["fr"], store("pl-PL", "en-US"))).toBe("pl-PL")
    expect(pickLocale(["pl"], store("pl-PL", "en-US"))).toBe("pl-PL")
    // Translation off: only the base exists.
    expect(pickLocale(["en-US"], { base: "pl-PL", locales: ["pl-PL"], translation: false })).toBe("pl-PL")
  })

  it("reads per-language values by code or language", () => {
    expect(localizedValue({ en: "Hi", "pl-PL": "Cześć" }, "en-US")).toBe("Hi")
    expect(localizedValue({ en: "Hi", "pl-PL": "Cześć" }, "pl")).toBe("Cześć")
    expect(localizedValue({ en: "Hi" }, "de-DE")).toBeUndefined()
    expect(localizedValue(undefined, "en")).toBeUndefined()
  })

  it("formats bare en and pl as before, other codes as given", () => {
    expect(intlLocale("en")).toBe("en-GB")
    expect(intlLocale("pl")).toBe("pl-PL")
    expect(intlLocale("en-US")).toBe("en-US")
    expect(intlLocale("de-DE")).toBe("de-DE")
  })

  describe("loadLanguages", () => {
    const base = { defaultLocale: "pl-PL" }

    it("uses only the base when the Translation module is not installed", async () => {
      const { container, graphCalls } = createTestContainer({ storeLocales: null })
      expect(await loadLanguages(container, base)).toEqual({ base: "pl-PL", locales: ["pl-PL"], translation: false })
      expect(graphCalls.filter((call) => call.entity === "store")).toEqual([])
    })

    it("adds the store's languages after the base, once each", async () => {
      const { container } = createTestContainer({ storeLocales: ["en-US", "pl-PL", "de_de", "en-us", "??"] })
      expect(await loadLanguages(container, base)).toEqual({
        base: "pl-PL",
        locales: ["pl-PL", "en-US", "de-DE"],
        translation: true,
      })
    })

    it("keeps the base alone when the store has no other languages", async () => {
      const { container } = createTestContainer({ storeLocales: [] })
      expect(await loadLanguages(container, base)).toEqual({ base: "pl-PL", locales: ["pl-PL"], translation: true })
    })

    it("falls back to the base when the store cannot be read", async () => {
      const { container, query } = createTestContainer({ storeLocales: ["en-US"] })
      query.graph.mockRejectedValueOnce(new Error("db down"))
      expect(await loadLanguages(container, base)).toEqual({ base: "pl-PL", locales: ["pl-PL"], translation: true })
    })
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
      base: "pl",
      custom: { en: { subject: "Custom EN", extra: "Extra" }, pl: { subject: "Custom PL" } },
      overrides: { pl: { heading: "Edytowany", body: "   " } },
    })
    expect(resolved.subject).toBe("Custom PL")
    expect(resolved.extra).toBe("Extra")
    expect(resolved.heading).toBe("Edytowany")
    expect(resolved.body).toBe(DEFAULT_COPY.pl.welcome.body)
  })

  describe("languages and the base fallback", () => {
    const welcome = DEFAULT_COPY.en.welcome
    const powitanie = DEFAULT_COPY.pl.welcome

    it("uses the built-in text of the language for any code in it", () => {
      expect(resolveCopy("welcome", "en-US", { base: "pl-PL" })).toEqual(welcome)
      expect(resolveCopy("welcome", "pl-PL", { base: "pl-PL" })).toEqual(powitanie)
    })

    it("fills a language without text of its own from the base, field by field", () => {
      const sources = {
        base: "pl-PL",
        overrides: { "pl-PL": { heading: "Witaj w sklepie" }, "de-DE": { subject: "Willkommen" } },
      }
      const german = resolveCopy("welcome", "de-DE", sources)
      expect(german.subject).toBe("Willkommen")
      // Not translated: the base's edit, then the base's default. Never another language.
      expect(german.heading).toBe("Witaj w sklepie")
      expect(german.body).toBe(powitanie.body)
    })

    it("falls back to the configured base, whichever it is", () => {
      expect(resolveCopy("welcome", "de-DE", { base: "en-GB" }).body).toBe(welcome.body)
      // A base without built-in text uses the English built-ins.
      expect(resolveCopy("welcome", "de-DE", { base: "de-DE" })).toEqual(welcome)
    })

    it("gives a custom template's languages by code or language, else the base's", () => {
      const custom = { en: { subject: "Back in stock" }, pl: { subject: "Znowu dostępny" } }
      expect(resolveCopy("x", "en-US", { base: "pl-PL", custom }).subject).toBe("Back in stock")
      expect(resolveCopy("x", "de-DE", { base: "pl-PL", custom }).subject).toBe("Znowu dostępny")
      expect(resolveCopy("x", "fr-FR", { base: "de-DE", custom }).subject).toBe("Back in stock")
    })

    it("knows the defaults the editor compares against", () => {
      expect(copyDefaults("welcome", "pl-PL", { base: "pl-PL" })).toEqual(powitanie)
      expect(copyDefaults("welcome", "en-US", { base: "pl-PL" })).toEqual(welcome)
      expect(copyDefaults("welcome", "de-DE", { base: "pl-PL" })).toEqual({})
      expect(ownDefaults("welcome", "de-DE")).toEqual({})
    })

    it("counts the fields a translation still misses", () => {
      const keys = Object.keys(welcome)
      const sources = { base: "pl-PL", overrides: { "de-DE": { subject: "Willkommen", heading: "  " } } }
      expect(missingFields(keys, "welcome", "pl-PL", sources)).toEqual([])
      expect(missingFields(keys, "welcome", "en-US", sources)).toEqual([])
      expect(missingFields(keys, "welcome", "de-DE", sources)).toEqual(keys.filter((key) => key !== "subject"))
    })
  })

  describe("validating admin edits", () => {
    const rules = { keys: ["subject", "body"], variables: ["first_name"], locales: ["en", "pl"] }
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
        '"de" is not a store language (use en, pl)',
      ])
    })

    it("accepts only the store's languages, stored under their own code", () => {
      const store = { ...rules, locales: ["pl-PL", "de-DE"] }
      const { overrides, errors } = validateOverrides(
        { de_de: { subject: "Willkommen" }, de: { subject: "Hallo" }, "en-US": { subject: "Hi" } },
        store,
        () => ({})
      )
      expect(overrides).toEqual({ "de-DE": { subject: "Willkommen" } })
      expect(errors).toEqual([
        '"de" is not a store language (use pl-PL, de-DE)',
        '"en-US" is not a store language (use pl-PL, de-DE)',
      ])
    })
  })

  it("describes a type for the editor and parses what the editor sends back", () => {
    const opts = options()
    const languages = { base: "en", locales: ["en", "pl"], translation: true }
    const settings = mergeSettings(opts, [{ key: copyKey("welcome"), value: { en: { subject: "Hello there" } } }])
    const described = describeCopy(opts, settings, "welcome", languages)

    expect(described).toMatchObject({ base_locale: "en", locales: ["en", "pl"], translation_enabled: true })
    expect(described.edited).toBe(true)
    expect(described.fields[0]).toEqual({ key: "subject", multiline: false })
    expect(described.fields.find((field) => field.key === "body")?.multiline).toBe(true)
    expect(described.copy.en.subject).toEqual({
      value: "Hello there",
      default: "Welcome to {{store_name}}",
      edited: true,
      original: "Hello there",
    })
    expect(described.copy.pl.subject.edited).toBe(false)

    expect(
      parseCopy(opts, "welcome", { en: { subject: "Welcome to {{store_name}}", heading: "Hi!" } }, languages)
    ).toEqual({ en: { heading: "Hi!" } })
    expect(() => parseCopy(opts, "welcome", { en: { subject: "{{token}}" } }, languages)).toThrow(
      /unknown variable \{\{token\}\}/
    )
  })

  describe("the editor in the store's languages", () => {
    const opts = options({ defaultLocale: "pl-PL" })
    const store = { base: "pl-PL", locales: ["pl-PL", "en-US", "de-DE"], translation: true }
    const settings = mergeSettings(opts, [
      { key: copyKey("welcome"), value: { "pl-PL": { heading: "Witaj!" }, "de-DE": { subject: "Willkommen" } } },
    ])

    it("shows every store language with its default and the original it falls back to", () => {
      const described = describeCopy(opts, settings, "welcome", store)
      expect(Object.keys(described.copy)).toEqual(["pl-PL", "en-US", "de-DE"])
      expect(described.copy["en-US"].heading).toMatchObject({ value: DEFAULT_COPY.en.welcome.heading, edited: false })
      // German has no text of its own: empty, with the (edited) Polish original to fall back to.
      expect(described.copy["de-DE"].heading).toEqual({ value: "", default: "", edited: false, original: "Witaj!" })
      expect(described.copy["de-DE"].subject).toMatchObject({ value: "Willkommen", edited: true })
      const fields = described.fields.length
      expect(described.missing).toEqual({ "pl-PL": 0, "en-US": 0, "de-DE": fields - 1 })
    })

    it("counts missing translations per type and for the shared texts", () => {
      expect(describeType(opts, settings, "welcome", store).missing_translations).toBe(
        copyKeys(opts, "welcome").length - 1
      )
      expect(describeCommon(opts, settings, store)).toEqual({
        edited: false,
        missing_translations: copyKeys(opts, "common").length,
        missing_locales: ["de-DE"],
      })
      // With only the base there is nothing to translate.
      const off = { base: "pl-PL", locales: ["pl-PL"], translation: false }
      expect(describeType(opts, settings, "welcome", off)).toMatchObject({ edited: true, missing_translations: 0 })
    })

    it("only shows edits of the store's current languages as edited", () => {
      const onlyGerman = mergeSettings(opts, [{ key: copyKey("welcome"), value: { "de-DE": { subject: "Hallo" } } }])
      const off = { base: "pl-PL", locales: ["pl-PL"], translation: false }
      expect(describeType(opts, onlyGerman, "welcome", store).edited).toBe(true)
      expect(describeType(opts, onlyGerman, "welcome", off).edited).toBe(false)
    })

    it("keeps edits of languages the editor does not show when saving", () => {
      const stored = { "pl-PL": { heading: "Stary" }, "de-DE": { subject: "Willkommen" } }
      const off = { base: "pl-PL", locales: ["pl-PL"], translation: false }
      expect(mergeHidden(stored, { "pl-PL": { heading: "Nowy" } }, off)).toEqual({
        "de-DE": { subject: "Willkommen" },
        "pl-PL": { heading: "Nowy" },
      })
      // A language the editor shows is replaced, even when the edit was cleared.
      expect(mergeHidden(stored, {}, store)).toEqual({})
    })

    it("accepts only store languages from requests", () => {
      expect(localeParam(undefined, store)).toBe("pl-PL")
      expect(localeParam("de_de", store)).toBe("de-DE")
      expect(() => localeParam("fr-FR", store)).toThrow('"fr-FR" is not a store language (use pl-PL, en-US, de-DE)')
      expect(() => parseCopy(opts, "welcome", { "fr-FR": { subject: "Bienvenue" } }, store)).toThrow(
        /"fr-FR" is not a store language/
      )
    })
  })
})

describe("registry and settings", () => {
  it("lists built-in and custom types with their default state", () => {
    const opts = options({
      disabledTypes: ["payment-received"],
      templates: {
        "abandoned-cart": {
          copy: { en: { subject: "Hi", coupon: "Code" } },
          enabled: false,
          audience: "customer",
          name: { en: "Abandoned cart", pl: "Porzucony koszyk" },
          source: { en: "My store" },
        },
      },
    })
    const definitions = listDefinitions(opts)
    expect(definitions).toHaveLength(BUILT_IN_TYPES.length + 1)
    expect(definitions.find((d) => d.type === "payment-received")?.defaultEnabled).toBe(false)
    expect(definitions.find((d) => d.type === "abandoned-cart")).toMatchObject({
      custom: true,
      defaultEnabled: false,
      variables: null,
      labels: { name: { en: "Abandoned cart", pl: "Porzucony koszyk" }, source: { en: "My store" } },
    })
    expect(definitions.find((d) => d.type === "order-confirmation")?.labels).toBeUndefined()
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

describe("build", () => {
  // Medusa's compiler leaves out every path with one of these folder names, so a
  // route or module there would be missing from the published plugin.
  const SKIPPED_BY_MEDUSA = ["test", "unit-tests", "integration-tests"]

  it("has no source folder that Medusa's build would leave out", () => {
    const src = join(__dirname, "../../..")
    const skipped: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const path = join(dir, entry.name)
          if (SKIPPED_BY_MEDUSA.includes(entry.name)) {
            skipped.push(relative(src, path).split("\\").join("/"))
          }
          walk(path)
        }
      }
    }
    walk(src)
    expect(skipped).toEqual([])
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
