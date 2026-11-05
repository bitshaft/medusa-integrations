"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const addresses_1 = require("../addresses");
describe("addresses", () => {
    it("formats Polish postal codes", () => {
        expect((0, addresses_1.formatPostalCode)("00950", "pl")).toBe("00-950");
        expect((0, addresses_1.formatPostalCode)("00-950", "PL")).toBe("00-950");
        expect((0, addresses_1.formatPostalCode)(" 12345 ", "de")).toBe("12345");
    });
    it("normalizes phone numbers", () => {
        expect((0, addresses_1.normalizePhone)("+48 (600) 100-200")).toBe("+48600100200");
        expect((0, addresses_1.normalizePhone)("")).toBeUndefined();
        expect((0, addresses_1.normalizePhone)(null)).toBeUndefined();
    });
    describe("customerAddress", () => {
        it("maps a Medusa address", () => {
            expect((0, addresses_1.customerAddress)({
                first_name: "Anna",
                last_name: "Nowak",
                address_1: "Długa 15",
                address_2: "m. 4",
                city: "Gdańsk",
                postal_code: "80831",
                country_code: "pl",
                phone: "600 300 400",
            }, "anna@example.com", "GDA01M")).toEqual({
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
            });
        });
        it("uses the company as the name for business addresses", () => {
            const address = (0, addresses_1.customerAddress)({ company: "ACME", first_name: "Jan", address_1: "x" }, null);
            expect(address.name).toBe("ACME");
            expect(address.contact_person).toBe("Jan");
            expect(address.is_residential).toBe(false);
        });
        it("requires an address", () => {
            expect(() => (0, addresses_1.customerAddress)(null, "a@b.pl")).toThrow("shipping address is required");
        });
    });
    describe("warehouseAddress", () => {
        const location = {
            id: "sloc_1",
            name: "Magazyn Warszawa",
            address: { address_1: "Magazynowa 1", city: "Warszawa", postal_code: "00001", country_code: "pl", phone: "221234567" },
        };
        it("merges overrides > location > defaults", () => {
            const address = (0, addresses_1.warehouseAddress)({
                location,
                defaults: { name: "Sklep Sp. z o.o.", email: "shop@example.com", contactPerson: "Jan", phone: "111" },
                overrides: { contactPerson: "Ewa" },
            });
            expect(address).toMatchObject({
                name: "Magazyn Warszawa",
                contact_person: "Ewa",
                line1: "Magazynowa 1",
                postal_code: "00-001",
                city: "Warszawa",
                country_code: "PL",
                phone: "221234567",
                email: "shop@example.com",
                is_residential: false,
            });
        });
        it("prefers the location company over its name", () => {
            expect((0, addresses_1.warehouseAddress)({ location: { ...location, address: { ...location.address, company: "ACME" } }, defaults: {} }).name).toBe("ACME");
        });
        it("works from options alone", () => {
            const address = (0, addresses_1.warehouseAddress)({
                location: null,
                defaults: { name: "S", line1: "A 1", postalCode: "00-001", city: "W" },
            });
            expect((0, addresses_1.missingAddressFields)(address)).toEqual([]);
        });
    });
    it("explains which fields are missing", () => {
        expect(() => (0, addresses_1.assertCompleteAddress)({ name: "", line1: "", postal_code: "", city: "X", country_code: "PL" }, "sender")).toThrow(/missing: name, line1, postal_code.*stock location/);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRkcmVzc2VzLnNwZWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvbGliL19fdGVzdHNfXy9hZGRyZXNzZXMuc3BlYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDRDQU9xQjtBQUVyQixRQUFRLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtJQUN6QixFQUFFLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1FBQ3JDLE1BQU0sQ0FBQyxJQUFBLDRCQUFnQixFQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUN0RCxNQUFNLENBQUMsSUFBQSw0QkFBZ0IsRUFBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDdkQsTUFBTSxDQUFDLElBQUEsNEJBQWdCLEVBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO0lBQ3pELENBQUMsQ0FBQyxDQUFBO0lBRUYsRUFBRSxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtRQUNsQyxNQUFNLENBQUMsSUFBQSwwQkFBYyxFQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUE7UUFDaEUsTUFBTSxDQUFDLElBQUEsMEJBQWMsRUFBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFBO1FBQzFDLE1BQU0sQ0FBQyxJQUFBLDBCQUFjLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQTtJQUM5QyxDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7UUFDL0IsRUFBRSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtZQUMvQixNQUFNLENBQ0osSUFBQSwyQkFBZSxFQUNiO2dCQUNF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