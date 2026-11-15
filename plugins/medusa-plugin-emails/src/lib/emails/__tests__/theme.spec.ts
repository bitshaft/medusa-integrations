import { pluginOptionsSchema, resolveBrand } from "../options"
import { renderEmail } from "../render"
import { mergeSettings, THEME_KEY } from "../settings"
import { cleanTheme, FONTS } from "../theme"

const options = (brand: Record<string, unknown> = {}) =>
  pluginOptionsSchema.parse({ from: "Shop <orders@shop.test>", storefrontUrl: "https://shop.test", brand })

const welcome = { customer: { first_name: "Anna" }, action_url: "https://shop.test" }

describe("email theme (Appearance tab)", () => {
  it("keeps only valid values of a stored theme", () => {
    expect(
      cleanTheme({
        colors: { primary: "#0F766E", text: "red", nonsense: "#000000" },
        font: "comic-sans",
        button_shape: "pill",
        card_shape: "soft",
        header_align: "left",
        logo_url: "http://insecure.test/logo.png",
        logo_width: 5000,
      })
    ).toEqual({ colors: { primary: "#0f766e" }, button_shape: "pill", card_shape: "soft", header_align: "left" })
    expect(cleanTheme("broken")).toEqual({})
    expect(cleanTheme({ logo_url: null })).toEqual({ logo_url: null })
    expect(mergeSettings(options() as never, [{ key: THEME_KEY, value: { font: "georgia" } }]).theme).toEqual({
      font: "georgia",
    })
  })

  it("lays the theme over the brand from the options, field by field", () => {
    const base = options({ logoUrl: "https://cdn.shop.test/logo.png", colors: { primary: "#111111", text: "#222222" } })
    const brand = resolveBrand(base, "pl", "Shop", {
      colors: { primary: "#0f766e" },
      font: "georgia",
      button_shape: "pill",
    })
    expect(brand.colors.primary).toBe("#0f766e")
    expect(brand.colors.text).toBe("#222222")
    expect(brand.logoUrl).toBe("https://cdn.shop.test/logo.png")
    expect(brand.style).toMatchObject({
      font: "georgia",
      fontFamily: FONTS.georgia,
      buttonRadius: 999,
      cardRadius: 8,
      headerAlign: "center",
    })
    expect(resolveBrand(base, "pl", "Shop", { logo_url: null }).logoUrl).toBeUndefined()
    expect(resolveBrand(options({ style: { cardShape: "square" } }), "pl").style.cardRadius).toBe(0)
  })

  it("renders the email with the theme", async () => {
    const rendered = await renderEmail({
      options: options({ logoUrl: "https://cdn.shop.test/logo.png" }),
      type: "welcome",
      locale: "pl",
      data: welcome,
      theme: {
        colors: { primary: "#0f766e", background: "#fefce8" },
        font: "georgia",
        button_shape: "pill",
        card_shape: "soft",
        header_align: "left",
        logo_url: null,
      },
      storeName: "Sklep Testowy",
    })
    expect(rendered.html).toContain("#0f766e")
    expect(rendered.html).toContain("#fefce8")
    expect(rendered.html).toContain("Georgia")
    expect(rendered.html).toContain("border-radius:999px")
    expect(rendered.html).toContain("border-radius:16px")
    expect(rendered.html).toContain("text-align:left")
    expect(rendered.html).not.toContain("cdn.shop.test/logo.png")
    expect(rendered.html).toContain("Sklep Testowy")
  })

  it("without a theme the emails look as before", async () => {
    const rendered = await renderEmail({ options: options(), type: "welcome", locale: "pl", data: welcome })
    expect(rendered.html).toContain("border-radius:6px")
    expect(rendered.html).toContain("border-radius:8px")
    expect(rendered.html).toContain("text-align:center")
  })
})
