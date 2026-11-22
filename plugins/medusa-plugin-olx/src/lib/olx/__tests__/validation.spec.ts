import { draftTitle, productImages, regularPln } from "../catalog"
import { createState, decryptSecret, encryptSecret, hashState } from "../crypto"
import type { AdvertInput } from "../types"
import { isPublicImageUrl, looksLikePhone, plainText, validateAdvert } from "../validation"

const valid: AdvertInput = {
  title: "Marynarka wełniana vintage rozmiar 50",
  description:
    "Włoska marynarka z flaneli wełnianej, stan bardzo dobry, bez przetarć i plam. Wymiary podajemy w wiadomości po zakupie.",
  price: "399.00",
  negotiable: false,
  category_id: 9001,
  attributes: [],
  images: ["https://cdn.example.com/a.jpg"],
  city_id: 8001,
  district_id: null,
  contact_name: "Sklep",
  contact_phone: null,
  advertiser_type: "business",
}

const codes = (patch: Partial<AdvertInput>) => validateAdvert({ ...valid, ...patch }).map((i) => `${i.field}:${i.code}`)

describe("validateAdvert", () => {
  it("accepts a correct advert", () => {
    expect(validateAdvert(valid)).toEqual([])
  })

  it.each([
    [{ title: "Za krótki tytuł" }, "title:too_short"],
    [{ title: "a".repeat(151) }, "title:too_long"],
    [{ description: "Krótki opis" }, "description:too_short"],
    [{ description: "a".repeat(9001) }, "description:too_long"],
    [{ title: "Marynarka wełniana!!! okazja" }, "title:repeated_punctuation"],
    [{ title: "MARYNARKA WEŁNIANA vintage" }, "title:too_many_capitals"],
    [{ description: `${valid.description} pisz na sklep@example.com` }, "description:contains_email"],
    [{ description: `${valid.description} zobacz www.example.com` }, "description:contains_website"],
    [{ price: "0" }, "price:invalid"],
    [{ price: "abc" }, "price:invalid"],
    [{ price: "10.999" }, "price:invalid"],
    [{ category_id: 0 }, "category:missing"],
    [{ city_id: 0 }, "city:missing"],
    [{ contact_name: "  " }, "contact:missing"],
    [{ images: [] }, "images:missing"],
    [{ images: ["http://localhost:9000/a.jpg"] }, "images:not_public"],
  ])("%j → %s", (patch, code) => {
    expect(codes(patch as Partial<AdvertInput>)).toContain(code)
  })

  it("does not block a code or a phone-like number: OLX decides", () => {
    expect(codes({ description: `${valid.description} EAN 5901234567890, SKU 123456789, tel. 500 100 200` })).toEqual(
      []
    )
  })
})

describe("looksLikePhone", () => {
  it.each([
    ["tel. 500 100 200", true],
    ["500-100-200", true],
    ["500100200", true],
    ["+48 500 100 200", true],
    ["EAN 5901234567890", false],
    ["zamówienie 12345678", false],
    ["Marynarka 50 lata 1990", false],
  ])("%s → %s", (text, expected) => {
    expect(looksLikePhone(text)).toBe(expected)
  })
})

describe("isPublicImageUrl", () => {
  it.each([
    ["https://cdn.example.com/a.jpg", true],
    ["http://cdn.example.com/a.jpg", false],
    ["https://localhost/a.jpg", false],
    ["https://127.0.0.1/a.jpg", false],
    ["https://192.168.1.5/a.jpg", false],
    ["https://10.0.0.1/a.jpg", false],
    ["https://172.20.0.1/a.jpg", false],
    ["https://172.40.0.1/a.jpg", true],
    ["https://minio.local/a.jpg", false],
    ["https://[::1]/a.jpg", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isPublicImageUrl(url)).toBe(expected)
  })
})

describe("plainText", () => {
  it("removes HTML and keeps the line breaks", () => {
    expect(plainText("<p>Stan <b>dobry</b></p><p>Wełna &amp; len</p>")).toBe("Stan dobry\nWełna & len")
  })
  it("handles an empty description", () => {
    expect(plainText(null)).toBe("")
  })
})

describe("drafts", () => {
  it("adds the variant to the title only when there is a choice", () => {
    expect(draftTitle("Marynarka", "50", 2)).toBe("Marynarka 50")
    expect(draftTitle("Marynarka", "50", 1)).toBe("Marynarka")
    expect(draftTitle("Marynarka", "Default variant", 2)).toBe("Marynarka")
  })

  it("takes the regular PLN price, not a promotion or a tier", () => {
    expect(
      regularPln([
        { amount: 10, currency_code: "eur" },
        { amount: 100, currency_code: "pln", price_list_id: "plist_1" },
        { amount: 90, currency_code: "pln", rules_count: 1 },
        { amount: 80, currency_code: "pln", min_quantity: 5 },
        { amount: 399.5, currency_code: "pln", rules_count: 0 },
      ])
    ).toBe("399.50")
    expect(regularPln([{ amount: 10, currency_code: "eur" }])).toBeNull()
  })

  it("puts the cover first, in order, without repeats", () => {
    expect(
      productImages({
        id: "p",
        title: "t",
        thumbnail: "https://x/b.jpg",
        images: [
          { url: "https://x/c.jpg", rank: 2 },
          { url: "https://x/b.jpg", rank: 1 },
          { url: "https://x/a.jpg", rank: 0 },
        ],
      })
    ).toEqual(["https://x/b.jpg", "https://x/a.jpg", "https://x/c.jpg"])
  })
})

describe("token encryption", () => {
  const key = "k".repeat(32)

  it("round-trips and never stores the plain value", () => {
    const sealed = encryptSecret("token-value", key)
    expect(sealed).not.toContain("token-value")
    expect(decryptSecret(sealed, key)).toBe("token-value")
  })

  it("differs on every call", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key))
  })

  it("reads nothing with another key or after a change", () => {
    const sealed = encryptSecret("token-value", key)
    expect(decryptSecret(sealed, "z".repeat(32))).toBeNull()
    const parts = sealed.split(".")
    parts[3] = Buffer.from("tampered").toString("base64url")
    expect(decryptSecret(parts.join("."), key)).toBeNull()
    expect(decryptSecret("garbage", key)).toBeNull()
  })

  it("makes long random states and stores only a hash", () => {
    const state = createState()
    expect(state.length).toBeGreaterThanOrEqual(40)
    expect(state).not.toBe(createState())
    expect(hashState(state)).toMatch(/^[0-9a-f]{64}$/)
  })
})
