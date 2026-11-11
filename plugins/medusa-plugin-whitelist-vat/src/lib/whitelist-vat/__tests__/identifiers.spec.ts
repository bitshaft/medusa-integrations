import { isValidBankAccount, isValidNip, isValidRegon, normalizeBankAccount, parseTaxId } from "../identifiers"

describe("check digits", () => {
  it("validates NIP numbers", () => {
    expect(isValidNip("5260250274")).toBe(true)
    expect(isValidNip("5261040567")).toBe(true)
    expect(isValidNip("5260250275")).toBe(false)
    expect(isValidNip("0000000000")).toBe(false)
    expect(isValidNip("526025027")).toBe(false)
    expect(isValidNip("52602502a4")).toBe(false)
  })

  it("validates REGON numbers of 9 and 14 digits", () => {
    expect(isValidRegon("011417295")).toBe(true)
    expect(isValidRegon("011417296")).toBe(false)
    expect(isValidRegon("12345678512347")).toBe(true)
    expect(isValidRegon("12345678512348")).toBe(false)
    expect(isValidRegon("1234")).toBe(false)
  })

  it("validates Polish bank accounts", () => {
    expect(normalizeBankAccount("PL 61 1090 1014 0000 0712 1981 2874")).toBe("61109010140000071219812874")
    expect(normalizeBankAccount("61-1090-1014-0000-0712-1981-2874")).toBe("61109010140000071219812874")
    expect(isValidBankAccount("61109010140000071219812874")).toBe(true)
    expect(isValidBankAccount("61109010140000071219812875")).toBe(false)
    expect(isValidBankAccount("6110901014")).toBe(false)
  })
})

describe("parseTaxId", () => {
  it("reads Polish NIPs however they are typed", () => {
    for (const input of ["5260250274", "526-025-02-74", "526 025 02 74", "PL5260250274", "pl 526-025-02-74"]) {
      expect(parseTaxId(input)).toMatchObject({
        kind: "nip",
        country_code: "PL",
        number: "5260250274",
        local: "5260250274",
        valid: true,
      })
    }
  })

  it("catches typos in a NIP before any register is asked", () => {
    expect(parseTaxId("5260250275")).toMatchObject({ kind: "nip", valid: false, problem: "checksum" })
    expect(parseTaxId("PL123")).toMatchObject({ kind: "nip", valid: false, problem: "format" })
    expect(parseTaxId("")).toMatchObject({ valid: false, problem: "empty" })
    expect(parseTaxId(undefined)).toMatchObject({ valid: false, problem: "empty" })
  })

  it("reads EU VAT numbers with their prefix", () => {
    expect(parseTaxId("DE 123456789")).toMatchObject({
      kind: "eu_vat",
      country_code: "DE",
      number: "DE123456789",
      local: "123456789",
      valid: true,
    })
    expect(parseTaxId("ATU12345678")).toMatchObject({ country_code: "AT", number: "ATU12345678", valid: true })
    expect(parseTaxId("NL123456789B01")).toMatchObject({ country_code: "NL", valid: true })
    expect(parseTaxId("IE6388047V")).toMatchObject({ country_code: "IE", valid: true })
    expect(parseTaxId("FRXX123456789")).toMatchObject({ country_code: "FR", valid: true })
  })

  it("uses the billing country for numbers without a prefix", () => {
    expect(parseTaxId("123456789", "de")).toMatchObject({ kind: "eu_vat", number: "DE123456789", valid: true })
    expect(parseTaxId("U12345678", "AT")).toMatchObject({ number: "ATU12345678", valid: true })
    // Greece is GR in ISO and EL in VIES.
    expect(parseTaxId("123456789", "GR")).toMatchObject({ country_code: "EL", number: "EL123456789", valid: true })
    expect(parseTaxId("GR123456789")).toMatchObject({ country_code: "EL", valid: true })
    // An explicit prefix wins over the billing country.
    expect(parseTaxId("PL5260250274", "DE")).toMatchObject({ kind: "nip", number: "5260250274", valid: true })
    // Outside the EU the number is read as Polish.
    expect(parseTaxId("5260250274", "US")).toMatchObject({ kind: "nip", valid: true })
  })

  it("rejects numbers that fit no member state", () => {
    expect(parseTaxId("US123456789")).toMatchObject({ valid: false, problem: "unknown_country" })
    expect(parseTaxId("DE12345")).toMatchObject({ country_code: "DE", valid: false, problem: "format" })
  })
})
