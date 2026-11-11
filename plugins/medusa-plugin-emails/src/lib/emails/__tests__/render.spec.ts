import { sampleData, sampleOrder } from "../data/sample"
import { LOCALES } from "../locales"
import { type EmailsPluginOptionsInput, pluginOptionsSchema } from "../options"
import { listDefinitions } from "../registry"
import { renderEmail } from "../render"
import { BUILT_IN_TYPES } from "../types"

const options = (extra: Partial<EmailsPluginOptionsInput> = {}) =>
  pluginOptionsSchema.parse({ from: "Shop <orders@shop.test>", storefrontUrl: "https://shop.test", ...extra })

describe("renderEmail", () => {
  it.each(BUILT_IN_TYPES.flatMap((definition) => LOCALES.map((locale) => [definition.type, locale] as const)))(
    "renders %s in %s without leftover placeholders",
    async (type, locale) => {
      const order = sampleOrder(locale)
      const rendered = await renderEmail({
        options: options(),
        type,
        locale,
        data: sampleData(type, order, { action: "https://shop.test/action" }),
        storeName: "Test Shop",
      })

      expect(rendered.subject.length).toBeGreaterThan(3)
      expect(rendered.html).toContain("<html")
      expect(rendered.html).toContain(`lang="${locale}"`)
      expect(rendered.text.length).toBeGreaterThan(20)
      for (const part of [rendered.subject, rendered.html, rendered.text]) {
        expect(part).not.toMatch(/\{\{.*?\}\}/)
        expect(part).not.toContain("undefined")
      }
    }
  )

  it("uses the customer's language", async () => {
    const data = sampleData("order-confirmation", sampleOrder("pl"), {})
    const polish = await renderEmail({ options: options(), type: "order-confirmation", locale: "pl", data })
    const english = await renderEmail({ options: options(), type: "order-confirmation", locale: "en", data })
    expect(polish.subject).toBe("Potwierdzenie zamówienia nr 1042")
    expect(english.subject).toBe("Order #1042 confirmed")
    expect(polish.text).toMatch(/262,99\szł/)
    expect(polish.text).toMatch(/ul\. Lipowa 12\/4\s+00-001 Warszawa/)
  })

  it("applies admin edits and escapes them", async () => {
    const rendered = await renderEmail({
      options: options(),
      type: "welcome",
      locale: "en",
      data: { customer: { first_name: "Anna", email: "anna@example.com" } },
      overrides: {
        type: { en: { subject: "Hello {{first_name}}", body: "<script>alert(1)</script> for {{store_name}}" } },
      },
      storeName: "Test Shop",
    })
    expect(rendered.subject).toBe("Hello Anna")
    expect(rendered.html).not.toContain("<script>alert(1)</script>")
    expect(rendered.html).toContain("&lt;script&gt;")
    expect(rendered.text).toContain("for Test Shop")
  })

  it("shows branding from the options", async () => {
    const rendered = await renderEmail({
      options: options({
        brand: {
          name: "Acme",
          logoUrl: "https://cdn.shop.test/logo.png",
          colors: { primary: "#ff5500" },
          footerText: { en: "Registered in Warsaw", pl: "Zarejestrowano w Warszawie" },
          company: { name: "Acme sp. z o.o.", taxId: "NIP 1234567890" },
          links: { terms: "https://shop.test/terms", returns: "https://shop.test/returns" },
        },
      }),
      type: "welcome",
      locale: "pl",
      data: { customer: { first_name: "Anna" }, action_url: "https://shop.test" },
    })
    expect(rendered.html).toContain("https://cdn.shop.test/logo.png")
    expect(rendered.html).toContain("#ff5500")
    expect(rendered.html).toContain("Zarejestrowano w Warszawie")
    expect(rendered.html).toContain("NIP 1234567890")
    expect(rendered.html).toContain("https://shop.test/terms")
    expect(rendered.subject).toBe("Witamy w Acme")
  })

  it("shows an unsubscribe link only when the data has one", async () => {
    const withLink = await renderEmail({
      options: options(),
      type: "welcome",
      locale: "pl",
      data: { unsubscribe_url: "https://api.shop.test/hooks/x/unsubscribe/abc" },
    })
    expect(withLink.html).toContain('href="https://api.shop.test/hooks/x/unsubscribe/abc"')
    expect(withLink.html).toContain("Wypisz się")

    const withoutLink = await renderEmail({ options: options(), type: "welcome", locale: "en", data: {} })
    expect(withoutLink.html).not.toContain("Unsubscribe")

    const unsafe = await renderEmail({
      options: options(),
      type: "welcome",
      locale: "en",
      data: { unsubscribe_url: "javascript:alert(1)" },
    })
    expect(unsafe.html).not.toContain("javascript:")
  })

  it("hides the button when there is no link", async () => {
    const withLink = await renderEmail({
      options: options(),
      type: "welcome",
      locale: "en",
      data: { action_url: "https://shop.test" },
    })
    const withoutLink = await renderEmail({ options: options(), type: "welcome", locale: "en", data: {} })
    expect(withLink.html).toContain("Go to the store")
    expect(withoutLink.html).not.toContain("Go to the store")
  })

  it("greets guests without a name", async () => {
    const rendered = await renderEmail({ options: options(), type: "welcome", locale: "en", data: {} })
    expect(rendered.text).toContain("Hello,")
    expect(rendered.text).not.toContain("Hi ,")
  })

  it("renders custom email types and replaced templates", async () => {
    const custom = options({
      templates: {
        "abandoned-cart": {
          copy: { en: { subject: "You left {{count}} items behind", body: "Come back, {{first_name}}." } },
        },
        welcome: { copy: { en: { subject: "Custom welcome" } } },
      },
    })
    expect(listDefinitions(custom).map((definition) => definition.type)).toContain("abandoned-cart")

    const cart = await renderEmail({
      options: custom,
      type: "abandoned-cart",
      locale: "pl",
      data: { count: 3, customer: { first_name: "Anna" } },
    })
    // Polish is not provided, so the template's own language is used.
    expect(cart.subject).toBe("You left 3 items behind")
    expect(cart.text).toContain("Come back, Anna.")

    const welcome = await renderEmail({ options: custom, type: "welcome", locale: "en", data: {} })
    expect(welcome.subject).toBe("Custom welcome")
  })

  it("rejects unknown types", async () => {
    await expect(renderEmail({ options: options(), type: "nope", locale: "en", data: {} })).rejects.toThrow(
      /Unknown email type "nope"/
    )
  })
})
