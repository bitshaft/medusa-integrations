import { readFileSync } from "node:fs"
import { join } from "node:path"

import { classifyAvailability } from "../availability"
import { COPY, DEFAULT_CONSENT } from "../copy"
import { backInStockEmailTemplate } from "../emails-template"
import { actionLink, productLink } from "../links"
import { fillUrl, localeCode, normalizeLocale, parseOptions, pluginOptionsSchema } from "../options"
import { productLabel, renderEmail, renderPage } from "../render"
import { mergeSettings, parseSettingsUpdate } from "../settings"
import { createToken, hashToken, isWellFormedToken } from "../tokens"
import { PRODUCT } from "./fixtures"

describe("options", () => {
  it("stays disabled without a way to build unsubscribe links", () => {
    expect(parseOptions(undefined)).toEqual({
      enabled: false,
      reason: "missing option backendUrl (needed for the unsubscribe link in every email)",
    })
    expect(parseOptions({ urls: { unsubscribe: "https://shop.test/u?t={token}" } }).enabled).toBe(false)
    expect(
      parseOptions({ urls: { confirm: "https://shop.test/c?t={token}", unsubscribe: "https://shop.test/u?t={token}" } })
        .enabled
    ).toBe(true)
  })

  it("has the agreed defaults", () => {
    const parsed = parseOptions({ backendUrl: "https://api.shop.test" })
    expect(parsed.enabled && parsed.options).toMatchObject({
      emails: "auto",
      demo: false,
      defaultLocale: "en",
      channel: "email",
      store: { rateLimitPerMinute: 10 },
      settings: {
        minQuantity: 1,
        delayMinutes: 5,
        minGapHours: 24,
        maxNotifications: 5,
        doubleOptIn: false,
        retention: { unconfirmedDays: 7, endedDays: 180, activeDays: 365 },
      },
    })
  })

  it("reports invalid options without values", () => {
    const result = parseOptions({ backendUrl: "https://api.shop.test", settings: { maxNotifications: 0 } })
    expect(result).toEqual({ enabled: false, reason: expect.stringContaining("settings.maxNotifications") })
  })

  it("fills URL templates and gives up on missing values", () => {
    expect(
      fillUrl("{storefrontUrl}/{country_code}/products/{handle}", {
        storefrontUrl: "https://shop.test/",
        country_code: "pl",
        handle: "a b",
      })
    ).toBe("https://shop.test/pl/products/a%20b")
    expect(fillUrl("{storefrontUrl}/products/{handle}", { storefrontUrl: undefined, handle: "x" })).toBeUndefined()
    expect(normalizeLocale("pl-PL", "en")).toBe("pl")
    expect(normalizeLocale("de", "en")).toBe("en")
  })

  it("keeps the subscriber's full language code and picks its own texts by language", () => {
    expect(localeCode(" de_de ", "pl-PL")).toBe("de-DE")
    expect(localeCode("not a tag", "pl-PL")).toBe("pl-PL")
    expect(localeCode(undefined, "pl-PL")).toBe("pl-PL")
    // Own texts exist in English and Polish only: other languages use the default's.
    expect(normalizeLocale("en-US", "pl-PL")).toBe("en")
    expect(normalizeLocale("de-DE", "pl-PL")).toBe("pl")
    expect(normalizeLocale("de-DE", "fr-FR")).toBe("en")
  })

  it("accepts any language tag as the default, in canonical form", () => {
    const base = { backendUrl: "https://api.shop.test" }
    expect(pluginOptionsSchema.parse({ ...base, defaultLocale: "pl_pl" }).defaultLocale).toBe("pl-PL")
    expect(parseOptions({ ...base, defaultLocale: "not a tag" }).enabled).toBe(false)
  })

  it("puts the language in {locale} and the full code in {locale_code}", () => {
    expect(
      fillUrl("{storefrontUrl}/{locale}/p?lang={locale_code}", { storefrontUrl: "https://shop.test", locale: "de-DE" })
    ).toBe("https://shop.test/de/p?lang=de-DE")
    expect(fillUrl("{storefrontUrl}/{locale}/p", { storefrontUrl: "https://shop.test", locale: "pl" })).toBe(
      "https://shop.test/pl/p"
    )
  })
})

describe("links", () => {
  const options = pluginOptionsSchema.parse({
    backendUrl: "https://api.shop.test/",
    storefrontUrl: "https://shop.test",
  })

  it("point at the plugin's own pages by default, with one-click unsubscribe", () => {
    expect(actionLink(options, "unsubscribe", "tok", "pl")).toEqual({
      url: "https://api.shop.test/hooks/back-in-stock/unsubscribe/tok",
      one_click: true,
    })
    expect(actionLink(options, "confirm", "tok", "pl")).toEqual({
      url: "https://api.shop.test/hooks/back-in-stock/confirm/tok",
      one_click: false,
    })
  })

  it("point at storefront pages when configured", () => {
    const storefront = pluginOptionsSchema.parse({
      storefrontUrl: "https://shop.test",
      urls: {
        confirm: "{storefrontUrl}/{locale}/confirm?token={token}",
        unsubscribe: "{storefrontUrl}/u?token={token}",
      },
    })
    expect(actionLink(storefront, "unsubscribe", "a+b", "pl")).toEqual({
      url: "https://shop.test/u?token=a%2Bb",
      one_click: false,
    })
    expect(actionLink(storefront, "confirm", "tok", "en")?.url).toBe("https://shop.test/en/confirm?token=tok")
  })

  it("build the product link, or none", () => {
    expect(productLink(options, PRODUCT, { country_code: "pl", locale: "pl" })).toBe(
      "https://shop.test/pl/products/hoodie"
    )
    expect(productLink(options, PRODUCT, { country_code: null, locale: "pl" })).toBeUndefined()
  })
})

describe("tokens", () => {
  it("are random, URL-safe and stored only as a hash", () => {
    const first = createToken()
    const second = createToken()
    expect(first.token).not.toBe(second.token)
    expect(isWellFormedToken(first.token)).toBe(true)
    expect(first.hash).toBe(hashToken(first.token))
    expect(first.hash).not.toContain(first.token)
    expect(isWellFormedToken("short")).toBe(false)
    expect(isWellFormedToken("../../etc/passwd")).toBe(false)
  })
})

describe("classifyAvailability", () => {
  it.each([
    [undefined, 5, { in_stock: false, available: null, reason: "missing" }],
    [{ id: "v", manage_inventory: false }, 0, { in_stock: true, available: null, reason: "untracked" }],
    [
      { id: "v", manage_inventory: true, allow_backorder: true },
      0,
      { in_stock: true, available: 0, reason: "backorder" },
    ],
    [{ id: "v", manage_inventory: true }, null, { in_stock: false, available: null, reason: "no_inventory_item" }],
    [{ id: "v", manage_inventory: true }, 0, { in_stock: false, available: 0, reason: "stock" }],
    [{ id: "v", manage_inventory: true }, 2, { in_stock: true, available: 2, reason: "stock" }],
  ])("%j with %p", (variant, computed, expected) => {
    expect(classifyAvailability(variant, computed, 1)).toEqual(expected)
  })

  it("applies the minimum quantity", () => {
    expect(classifyAvailability({ id: "v", manage_inventory: true }, 2, 3).in_stock).toBe(false)
    expect(classifyAvailability({ id: "v", manage_inventory: true }, 3, 3).in_stock).toBe(true)
  })
})

describe("settings", () => {
  const options = pluginOptionsSchema.parse({ backendUrl: "https://api.shop.test", settings: { minGapHours: 12 } })

  it("merge admin changes over the plugin options", () => {
    const settings = mergeSettings(options, {
      maxNotifications: 3,
      retention: { endedDays: 30 },
      consentText: { pl: "Zgoda" },
    })
    expect(settings).toMatchObject({
      minGapHours: 12,
      maxNotifications: 3,
      retention: { unconfirmedDays: 7, endedDays: 30, activeDays: 365 },
      consent: { pl: "Zgoda", en: DEFAULT_CONSENT.en },
    })
    expect(settings.overridden.sort()).toEqual(["consentText", "maxNotifications", "retention"])
  })

  it("fall back to the options when a stored value no longer validates", () => {
    expect(mergeSettings(options, { maxNotifications: -1 }).maxNotifications).toBe(5)
  })

  it("validate updates and drop empty consent texts", () => {
    expect(
      parseSettingsUpdate({ delayMinutes: 10, consentText: { pl: "  " } }, { consentText: { pl: "Stara" } })
    ).toEqual({
      value: { delayMinutes: 10, consentText: {} },
    })
    expect(parseSettingsUpdate({ retention: { endedDays: 90 } }, { retention: { activeDays: 100 } })).toEqual({
      value: { retention: { activeDays: 100, endedDays: 90 } },
    })
    expect(parseSettingsUpdate({ maxNotifications: 0 }, {})).toEqual({
      error: expect.stringContaining("maxNotifications"),
    })
  })
})

describe("copy and rendering", () => {
  it("has the same texts in English and Polish", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
        : [prefix]
    expect(keys(COPY.pl).sort()).toEqual(keys(COPY.en).sort())
  })

  it("says in the default consent that emails continue until purchase or unsubscribe", () => {
    expect(DEFAULT_CONSENT.en).toMatch(/until you buy it or unsubscribe/)
    expect(DEFAULT_CONSENT.pl).toMatch(/dopóki go nie kupisz albo się nie wypiszesz/)
  })

  it("renders the built-in email with an escaped body, a button and an unsubscribe link", () => {
    const rendered = renderEmail({
      kind: "restock",
      locale: "en",
      locale_code: "en",
      store_name: "Shop <script>",
      product_title: "Hoodie",
      variant_title: "M",
      product_label: productLabel("Hoodie", "M"),
      thumbnail: "https://cdn.shop.test/h.png",
      action_url: "https://shop.test/p/hoodie",
      unsubscribe_url: "https://api.shop.test/hooks/back-in-stock/unsubscribe/tok",
    })
    expect(rendered.subject).toBe("Hoodie · M is back in stock")
    expect(rendered.html).toContain('lang="en"')
    expect(rendered.html).toContain('href="https://shop.test/p/hoodie"')
    expect(rendered.html).toContain('href="https://api.shop.test/hooks/back-in-stock/unsubscribe/tok"')
    expect(rendered.html).toContain("Shop &lt;script&gt;")
    expect(rendered.html).not.toContain("<script>")
    expect(rendered.text).toContain("Unsubscribe: https://api.shop.test/hooks/back-in-stock/unsubscribe/tok")
    expect(rendered.text).not.toMatch(/\{\{/)
  })

  it("leaves out unsafe links", () => {
    const rendered = renderEmail({
      kind: "confirm",
      locale: "pl",
      locale_code: "pl",
      store_name: "Sklep",
      product_title: "Bluza",
      variant_title: "Default variant",
      product_label: productLabel("Bluza", "Default variant"),
      thumbnail: null,
      action_url: "javascript:alert(1)",
      unsubscribe_url: null,
    })
    expect(rendered.subject).toBe("Potwierdź powiadomienie o dostępności")
    expect(rendered.html).not.toContain("javascript:")
    expect(rendered.text).toContain("Bluza")
    expect(productLabel("Bluza", "Default variant")).toBe("Bluza")
  })

  it("renders link pages with a POST form", () => {
    const html = renderPage({ locale: "pl", title: "T", text: "<b>", formAction: "/hooks/x", button: "OK" })
    expect(html).toContain('<form method="post" action="/hooks/x">')
    expect(html).toContain("&lt;b&gt;")
    expect(html).toContain('name="robots" content="noindex"')
  })
})

describe("emails plugin template", () => {
  it("registers both email types with the copy keys the emails plugin edits", () => {
    expect(Object.keys(backInStockEmailTemplate)).toEqual(["back-in-stock", "back-in-stock-confirm"])
    for (const template of Object.values(backInStockEmailTemplate)) {
      expect(Object.keys(template.copy)).toEqual(["en", "pl"])
      expect(Object.keys(template.copy.pl).sort()).toEqual([
        "body",
        "button",
        "footnote",
        "heading",
        "preview",
        "subject",
      ])
      expect(template.audience).toBe("customer")
      expect(template.previewData("pl")).toMatchObject({ unsubscribe_url: expect.any(String) })
      // The emails plugin passes store codes.
      expect(template.previewData("pl-PL").product_title).toBe("Bluza z kapturem")
      expect(template.previewData("de-DE").product_title).toBe("Hooded sweatshirt")
    }
  })
})

describe("admin translations", () => {
  const read = (locale: string) =>
    JSON.parse(readFileSync(join(__dirname, `../../../admin/i18n/back-in-stock/${locale}.json`), "utf8")) as Record<
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
    expect(Object.keys(en)).toEqual(["back-in-stock"])
    expect(Object.keys(pl)).toEqual(["back-in-stock"])
    expect(flatten(pl).sort()).toEqual(flatten(en).sort())
  })
})
