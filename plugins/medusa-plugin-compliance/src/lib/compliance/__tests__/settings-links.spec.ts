import { readSettings, settingsSchema } from "../settings"

const gdpr = (links: Record<string, string>) => settingsSchema.safeParse({ gdpr: links })

describe("GDPR links (verify_url, privacy_policy_url)", () => {
  it("accepts web links, storefront paths and no link", () => {
    for (const value of [
      "https://shop.example/gdpr/verify?token={token}",
      "http://localhost:8000/privacy",
      "/pl/privacy",
      "",
    ]) {
      expect(gdpr({ verify_url: value, privacy_policy_url: value }).success).toBe(true)
    }
  })

  it.each([
    "javascript:alert(1)",
    " JAVASCRIPT:alert(1)",
    "data:text/html,<script>x</script>",
    "//evil.example/x",
    "shop.example/privacy",
  ])("refuses %s", (value) => {
    for (const key of ["verify_url", "privacy_policy_url"]) {
      const result = gdpr({ [key]: value })
      expect(result.success).toBe(false)
      expect(JSON.stringify(result.error?.issues)).toMatch(/http:\/\/, https:\/\/ or \//)
    }
  })

  it("clears links stored earlier that are not safe, and keeps every other setting", () => {
    const settings = readSettings({
      modules: { gdpr: true },
      gdpr: {
        verify_url: "javascript:alert(1)",
        privacy_policy_url: "https://shop.example/privacy",
        response_days: 14,
      },
    })
    expect(settings.gdpr.verify_url).toBe("")
    expect(settings.gdpr.privacy_policy_url).toBe("https://shop.example/privacy")
    expect(settings.gdpr.response_days).toBe(14)
    expect(settings.modules.gdpr).toBe(true)
  })
})
