import { effectiveSafety, gpsrGaps, type ManufacturerProfile, type ProductSafetyData } from "../gpsr"
import { markdownToText, renderMarkdown } from "../markdown"
import { DEFAULT_SETTINGS, settingsSchema } from "../settings"

const profile = (overrides: Partial<ManufacturerProfile> = {}): ManufacturerProfile => ({
  id: "cmfr_1",
  name: "Acme",
  manufacturer: {
    name: "Acme Sp. z o.o.",
    trade_name: "ACME",
    postal_address: "ul. Długa 1\n00-001 Warszawa",
    electronic_address: "bezpieczenstwo@acme.pl",
  },
  outside_eu: false,
  responsible: { name: null, trade_name: null, postal_address: null, electronic_address: null },
  ...overrides,
})

const product = (overrides: Partial<ProductSafetyData> = {}): ProductSafetyData => ({
  manufacturer_id: "cmfr_1",
  manufacturer: {},
  outside_eu: null,
  responsible: {},
  identification: { type: "Czajnik", model: "K-100", batch: null, batch_applicable: false },
  label_image_url: null,
  warnings: {},
  ...overrides,
})

const gpsr = DEFAULT_SETTINGS.gpsr

describe("effectiveSafety", () => {
  it("takes the manufacturer from the profile", () => {
    expect(effectiveSafety(product(), profile()).manufacturer.name).toBe("Acme Sp. z o.o.")
  })

  it("lets the product override single fields of the profile", () => {
    const result = effectiveSafety(
      product({ manufacturer: { electronic_address: "k100@acme.pl", name: "  " } }),
      profile()
    )
    expect(result.manufacturer.electronic_address).toBe("k100@acme.pl")
    // A blank override falls back to the profile.
    expect(result.manufacturer.name).toBe("Acme Sp. z o.o.")
  })

  it("shows the responsible person only for manufacturers outside the EU", () => {
    expect(effectiveSafety(product(), profile()).responsible).toBeNull()
    expect(effectiveSafety(product({ outside_eu: true }), profile()).responsible).not.toBeNull()
  })

  it("works without a profile", () => {
    const result = effectiveSafety(product({ manufacturer_id: null, manufacturer: { name: "Solo" } }), null)
    expect(result.manufacturer.name).toBe("Solo")
    expect(result.profile).toBeNull()
  })
})

describe("gpsrGaps", () => {
  it("is complete with a full EU profile and a product type", () => {
    expect(gpsrGaps(effectiveSafety(product(), profile()), gpsr)).toEqual([])
  })

  it("lists everything for a product without data", () => {
    expect(gpsrGaps(effectiveSafety(null, null), gpsr)).toEqual([
      "manufacturer.name",
      "manufacturer.postal_address",
      "manufacturer.electronic_address",
      "identification.type",
    ])
  })

  it("requires the responsible person when the manufacturer is outside the EU", () => {
    const outside = profile({ outside_eu: true })
    expect(gpsrGaps(effectiveSafety(product(), outside), gpsr)).toEqual([
      "responsible.name",
      "responsible.postal_address",
      "responsible.electronic_address",
    ])
    const filled = profile({
      outside_eu: true,
      responsible: {
        name: "EU Rep GmbH",
        trade_name: null,
        postal_address: "Berlin",
        electronic_address: "rep@example.eu",
      },
    })
    expect(gpsrGaps(effectiveSafety(product(), filled), gpsr)).toEqual([])
  })

  it("lets the product switch the outside-EU flag of its profile", () => {
    expect(gpsrGaps(effectiveSafety(product({ outside_eu: true }), profile()), gpsr)).toContain("responsible.name")
    expect(gpsrGaps(effectiveSafety(product({ outside_eu: false }), profile({ outside_eu: true })), gpsr)).toEqual([])
  })

  it("requires a batch or serial number only when it applies", () => {
    const applies = product({ identification: { type: "Czajnik", model: null, batch: null, batch_applicable: true } })
    expect(gpsrGaps(effectiveSafety(applies, profile()), gpsr)).toEqual(["identification.batch"])
  })

  it("follows the settings for optional fields", () => {
    const strict = settingsSchema.parse({
      gpsr: {
        require: {
          manufacturer_trade_name: true,
          identification_model: true,
          label_image: true,
          warnings: true,
        },
        warning_languages: ["pl", "en"],
      },
    }).gpsr
    const data = product({
      manufacturer_id: null,
      manufacturer: { name: "X", postal_address: "Y", electronic_address: "z@x.pl" },
      identification: { type: "T", model: null, batch: null, batch_applicable: false },
      warnings: { pl: "Uwaga" },
    })
    expect(gpsrGaps(effectiveSafety(data, null), strict)).toEqual([
      "manufacturer.trade_name",
      "identification.model",
      "label_image",
      "warnings.en",
    ])
  })
})

describe("renderMarkdown", () => {
  it("renders the supported subset", () => {
    expect(renderMarkdown("# Uwaga\n\n**Gorąca** powierzchnia\n*nie dotykać*\n\n- jeden\n- dwa\n\n1. a\n2. b")).toBe(
      "<h3>Uwaga</h3><p><strong>Gorąca</strong> powierzchnia<br><em>nie dotykać</em></p>" +
        "<ul><li>jeden</li><li>dwa</li></ul><ol><li>a</li><li>b</li></ol>"
    )
  })

  it("escapes HTML so nothing else can get in", () => {
    expect(renderMarkdown('<script>alert(1)</script> "a" & <b>b</b>')).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt; &quot;a&quot; &amp; &lt;b&gt;b&lt;/b&gt;</p>"
    )
  })

  it("returns an empty string for empty text", () => {
    expect(renderMarkdown("  \n ")).toBe("")
    expect(renderMarkdown(null)).toBe("")
  })

  it("gives a plain-text version", () => {
    expect(markdownToText("## Uwaga\n- **nie** dotykać")).toBe("Uwaga\n• nie dotykać")
  })
})
