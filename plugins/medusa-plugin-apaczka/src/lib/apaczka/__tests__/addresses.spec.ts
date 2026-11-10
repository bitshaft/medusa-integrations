import {
  assertCompleteAddress,
  customerAddress,
  formatPostalCode,
  missingAddressFields,
  normalizePhone,
  warehouseAddress,
} from "../addresses"

describe("addresses", () => {
  it("formats Polish postal codes", () => {
    expect(formatPostalCode("00950", "pl")).toBe("00-950")
    expect(formatPostalCode("00-950", "PL")).toBe("00-950")
    expect(formatPostalCode(" 12345 ", "de")).toBe("12345")
  })

  it("normalizes phone numbers", () => {
    expect(normalizePhone("+48 (600) 100-200")).toBe("+48600100200")
    expect(normalizePhone("")).toBeUndefined()
    expect(normalizePhone(null)).toBeUndefined()
  })

  describe("customerAddress", () => {
    it("maps a Medusa address", () => {
      expect(
        customerAddress(
          {
            first_name: "Anna",
            last_name: "Nowak",
            address_1: "Długa 15",
            address_2: "m. 4",
            city: "Gdańsk",
            postal_code: "80831",
            country_code: "pl",
            phone: "600 300 400",
          },
          "anna@example.com",
          "GDA01M"
        )
      ).toEqual({
        name: "Anna Nowak",
        contact_person: "Anna Nowak",
        line1: "Długa 15",
        line2: "m. 4",
        postal_code: "80-831",
        city: "Gdańsk",
        country_code: "PL",
        phone: "600300400",
        email: "anna@example.com",
        is_residential: true,
        foreign_address_id: "GDA01M",
      })
    })

    it("uses the company as the name for business addresses", () => {
      const address = customerAddress({ company: "ACME", first_name: "Jan", address_1: "x" }, null)
      expect(address.name).toBe("ACME")
      expect(address.contact_person).toBe("Jan")
      expect(address.is_residential).toBe(false)
    })

    it("requires an address", () => {
      expect(() => customerAddress(null, "a@b.pl")).toThrow("shipping address is required")
    })
  })

  describe("warehouseAddress", () => {
    const location = {
      id: "sloc_1",
      name: "Warsaw warehouse",
      address: {
        address_1: "Magazynowa 1",
        city: "Warszawa",
        postal_code: "00001",
        country_code: "pl",
        phone: "221234567",
      },
    }

    it("merges overrides > location > defaults", () => {
      const address = warehouseAddress({
        location,
        defaults: { name: "Sklep Sp. z o.o.", email: "shop@example.com", contactPerson: "Jan", phone: "111" },
        overrides: { contactPerson: "Ewa" },
      })
      expect(address).toMatchObject({
        name: "Warsaw warehouse",
        contact_person: "Ewa",
        line1: "Magazynowa 1",
        postal_code: "00-001",
        city: "Warszawa",
        country_code: "PL",
        phone: "221234567",
        email: "shop@example.com",
        is_residential: false,
      })
    })

    it("prefers the location company over its name", () => {
      expect(
        warehouseAddress({ location: { ...location, address: { ...location.address, company: "ACME" } }, defaults: {} })
          .name
      ).toBe("ACME")
    })

    it("works from options alone", () => {
      const address = warehouseAddress({
        location: null,
        defaults: { name: "S", line1: "A 1", postalCode: "00-001", city: "W" },
      })
      expect(missingAddressFields(address)).toEqual([])
    })
  })

  it("explains which fields are missing", () => {
    expect(() =>
      assertCompleteAddress({ name: "", line1: "", postal_code: "", city: "X", country_code: "PL" }, "sender")
    ).toThrow(/missing: name, line1, postal_code.*stock location/)
  })
})
