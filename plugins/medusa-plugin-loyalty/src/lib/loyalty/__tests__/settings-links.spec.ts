import { readSettings, settingsSchema } from "../settings"

describe("terms_url", () => {
  it("accepts web links and no link", () => {
    expect(settingsSchema.parse({ terms_url: "https://shop.example/terms" }).terms_url).toBe(
      "https://shop.example/terms"
    )
    expect(settingsSchema.parse({ terms_url: " http://shop.example/terms " }).terms_url).toBe(
      "http://shop.example/terms"
    )
    expect(settingsSchema.parse({ terms_url: null }).terms_url).toBeNull()
  })

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(document.cookie)",
    "data:text/html,<script>x</script>",
    "vbscript:x",
  ])("refuses %s, which would run in the storefront's href", (url) => {
    const result = settingsSchema.safeParse({ terms_url: url })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toMatch(/http:\/\/ or https:\/\//)
  })

  it("drops an unsafe link stored earlier without resetting the other settings", () => {
    const settings = readSettings({ enabled: true, terms_url: "javascript:alert(1)" })
    expect(settings.terms_url).toBeNull()
    expect(settings.enabled).toBe(true)
  })
})
