"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = require("../../../lib/apaczka");
const fixtures_1 = require("../../../lib/__tests__/fixtures");
const service_1 = require("../service");
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const location = {
    id: "sloc_1",
    name: "Magazyn",
    address: { address_1: "Magazynowa 1", city: "Warszawa", postal_code: "00-001", country_code: "pl", phone: "221112233" },
};
const shippingAddress = {
    first_name: "Anna",
    last_name: "Nowak",
    address_1: "Długa 15",
    city: "Gdańsk",
    postal_code: "80-831",
    country_code: "pl",
    phone: "600300400",
};
function createProvider(options = {}) {
    return new service_1.ApaczkaFulfillmentProviderService({ logger: logger }, {
        appId: fixtures_1.APP_ID,
        appSecret: fixtures_1.APP_SECRET,
        sender: { email: "shop@example.com", contactPerson: "Jan" },
        ...options,
    });
}
async function optionFor(provider, id) {
    const options = await provider.getFulfillmentOptions();
    return options.find((o) => o.id === id);
}
describe("ApaczkaFulfillmentProviderService", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(apaczka_1.ApaczkaClient.prototype, "getServiceStructure").mockResolvedValue(fixtures_1.serviceStructure);
    });
    it("validates options at construction", () => {
        expect(() => service_1.ApaczkaFulfillmentProviderService.validateOptions({})).toThrow(utils_1.MedusaError);
        expect(() => createProvider({ labelFormat: "gif" })).toThrow("labelFormat");
    });
    it("lists services as fulfillment options", async () => {
        const options = await createProvider().getFulfillmentOptions();
        expect(options.map((o) => o.id)).toContain("apaczka-41");
        expect(await createProvider().validateOption(options[0])).toBe(true);
        expect(await createProvider().validateOption({ id: "other" })).toBe(false);
        expect(await createProvider().canCalculate({ data: options[0] })).toBe(true);
    });
    it("explains connection failures when listing options", async () => {
        jest
            .spyOn(apaczka_1.ApaczkaClient.prototype, "getServiceStructure")
            .mockRejectedValue(new apaczka_1.ApaczkaApiError(400, "Invalid signature", "service_structure/"));
        await expect(createProvider().getFulfillmentOptions()).rejects.toThrow("Could not load services from Apaczka: Invalid signature");
    });
    describe("validateFulfillmentData", () => {
        it("requires a point for point delivery", async () => {
            const provider = createProvider();
            const option = await optionFor(provider, "apaczka-41");
            await expect(provider.validateFulfillmentData(option, {}, { from_location: location })).rejects.toThrow("data.point_id");
        });
        it("checks the point and stores snapshots", async () => {
            jest.spyOn(apaczka_1.ApaczkaClient.prototype, "getPoints").mockResolvedValue([
                {
                    type: "INPOST",
                    subtype: "parcel_locker",
                    name: "WAW01M",
                    foreign_address_id: "WAW01M",
                    address: { line1: "Marszałkowska 1", postal_code: "00-624", city: "Warszawa", country_code: "PL", latitude: "52", longitude: "21" },
                },
            ]);
            const provider = createProvider();
            const option = await optionFor(provider, "apaczka-41");
            const data = await provider.validateFulfillmentData(option, { point_id: "WAW01M" }, {
                from_location: location,
                shipping_address: shippingAddress,
            });
            expect(data).toMatchObject({
                point_id: "WAW01M",
                point: { id: "WAW01M", city: "Warszawa" },
                location_id: "sloc_1",
                location: { id: "sloc_1", address: { city: "Warszawa" } },
                apaczka_option: { id: "apaczka-41" },
            });
        });
        it("rejects unknown points and points without COD", async () => {
            jest.spyOn(apaczka_1.ApaczkaClient.prototype, "getPoints").mockResolvedValue([
                {
                    type: "INPOST",
                    subtype: "parcel_locker",
                    name: "NOCOD",
                    foreign_address_id: "NOCOD",
                    option_cod: false,
                    address: { line1: "x", postal_code: "00-001", city: "W", country_code: "PL", latitude: "0", longitude: "0" },
                },
            ]);
            const provider = createProvider();
            const option = await optionFor(provider, "apaczka-41");
            const cod = await optionFor(provider, "apaczka-41-cod");
            await expect(provider.validateFulfillmentData(option, { point_id: "MISSING" }, {})).rejects.toThrow("not found");
            await expect(provider.validateFulfillmentData(cod, { point_id: "NOCOD" }, {})).rejects.toThrow("cash on delivery");
        });
        it("does not block checkout when the point directory is down", async () => {
            jest.spyOn(apaczka_1.ApaczkaClient.prototype, "getPoints").mockRejectedValue(new Error("timeout"));
            const provider = createProvider();
            const option = await optionFor(provider, "apaczka-41");
            await expect(provider.validateFulfillmentData(option, { point_id: "WAW01M" }, {})).resolves.toMatchObject({
                point_id: "WAW01M",
            });
        });
    });
    describe("calculatePrice", () => {
        const context = {
            id: "cart_1",
            currency_code: "pln",
            email: "anna@example.com",
            shipping_address: shippingAddress,
            from_location: location,
            items: [{ title: "Kubek", quantity: 2, unit_price: 50, variant: { weight: 400 } }],
        };
        it("prices with Apaczka and applies markup", async () => {
            const valuate = jest
                .spyOn(apaczka_1.ApaczkaClient.prototype, "valuateOrder")
                .mockResolvedValue({ price_table: { "21": { price: 1000, price_gross: 1230 } } });
            const provider = createProvider({ pricing: { markupPercent: 10 } });
            const option = await optionFor(provider, "apaczka-21");
            await expect(provider.calculatePrice(option, {}, context)).resolves.toEqual({
                calculated_amount: 13.53,
                is_calculated_price_tax_inclusive: true,
            });
            const payload = valuate.mock.calls[0][0];
            expect(payload.address.sender).toMatchObject({ line1: "Magazynowa 1", email: "shop@example.com" });
            expect(payload.address.receiver).toMatchObject({ city: "Gdańsk", email: "anna@example.com" });
            expect(payload.shipment[0].weight).toBe(0.8);
        });
        it("caches identical quotes", async () => {
            const valuate = jest
                .spyOn(apaczka_1.ApaczkaClient.prototype, "valuateOrder")
                .mockResolvedValue({ price_table: { "21": { price: 1000, price_gross: 1230 } } });
            const provider = createProvider();
            const option = await optionFor(provider, "apaczka-21");
            await provider.calculatePrice(option, {}, context);
            await provider.calculatePrice(option, {}, context);
            expect(valuate).toHaveBeenCalledTimes(1);
        });
        it("uses the fallback amount when Apaczka fails", async () => {
            jest.spyOn(apaczka_1.ApaczkaClient.prototype, "valuateOrder").mockRejectedValue(new Error("down"));
            const provider = createProvider({ pricing: { fallbackAmount: 19.99 } });
            const option = await optionFor(provider, "apaczka-21");
            await expect(provider.calculatePrice(option, {}, context)).resolves.toMatchObject({
                calculated_amount: 19.99,
            });
        });
        it("fails clearly when the service cannot carry the parcel", async () => {
            jest.spyOn(apaczka_1.ApaczkaClient.prototype, "valuateOrder").mockResolvedValue({ price_table: {} });
            const provider = createProvider();
            const option = await optionFor(provider, "apaczka-21");
            await expect(provider.calculatePrice(option, {}, context)).rejects.toThrow("cannot carry this parcel");
        });
        it("asks for an address before pricing", async () => {
            const provider = createProvider();
            const option = await optionFor(provider, "apaczka-21");
            await expect(provider.calculatePrice(option, {}, { ...context, shipping_address: { country_code: "pl" } })).rejects.toThrow("Enter a shipping address");
        });
    });
    describe("createFulfillment", () => {
        const order = {
            id: "order_1",
            display_id: 1001,
            total: 112.3,
            customer: { email: "anna@example.com" },
            items: [{ id: "item_1", title: "Kubek", unit_price: 50, variant: { weight: 400 } }],
        };
        const items = [{ line_item_id: "item_1", title: "Kubek", quantity: 2 }];
        async function shippingData(provider, optionId = "apaczka-21") {
            const option = await optionFor(provider, optionId);
            return provider.validateFulfillmentData(option, {}, { from_location: location });
        }
        it("creates the Apaczka order once and returns labels", async () => {
            const send = jest.spyOn(apaczka_1.ApaczkaClient.prototype, "sendOrder").mockResolvedValue({
                id: 555,
                service_id: 21,
                service_name: "DPD Classic",
                waybill_number: "W123",
                pickup_number: null,
                tracking_url: "https://track/W123",
                status: "NEW",
                shipments_count: 1,
                supplier: "DPD",
            });
            jest.spyOn(apaczka_1.ApaczkaClient.prototype, "getOrder").mockResolvedValue({ price: "9.92", price_gross: "12.20" });
            const provider = createProvider();
            const data = await shippingData(provider);
            const result = await provider.createFulfillment(data, items, order, {
                id: "ful_1",
                location_id: "sloc_1",
                delivery_address: shippingAddress,
            });
            expect(send).toHaveBeenCalledTimes(1);
            expect(send.mock.calls[0][0]).toMatchObject({
                service_id: 21,
                content: "Order #1001",
                address: { sender: { line1: "Magazynowa 1" }, receiver: { email: "anna@example.com" } },
            });
            expect(result.labels).toEqual([
                { tracking_number: "W123", tracking_url: "https://track/W123", label_url: "/admin/apaczka/orders/555/documents/waybill" },
            ]);
            expect(result.data.apaczka).toMatchObject({
                state: "created",
                order_id: 555,
                status: "created",
                price_net: 992,
                price_gross: 1220,
            });
        });
        it("defers in manual mode", async () => {
            const send = jest.spyOn(apaczka_1.ApaczkaClient.prototype, "sendOrder");
            const provider = createProvider({ shipmentCreation: "manual" });
            const result = await provider.createFulfillment(await shippingData(provider), items, order, {
                location_id: "sloc_1",
                delivery_address: shippingAddress,
            });
            expect(send).not.toHaveBeenCalled();
            expect(result).toMatchObject({ labels: [], data: { apaczka: { state: "pending", service_id: 21 } } });
        });
        it("defers with a reason when the sender address is unknown", async () => {
            const send = jest.spyOn(apaczka_1.ApaczkaClient.prototype, "sendOrder");
            const provider = createProvider();
            const data = await shippingData(provider);
            const result = await provider.createFulfillment(data, items, order, {
                location_id: "sloc_other",
                delivery_address: shippingAddress,
            });
            expect(send).not.toHaveBeenCalled();
            expect(result.data.apaczka).toMatchObject({ state: "pending", error: expect.stringContaining("Sender address") });
        });
        it("surfaces Apaczka validation errors", async () => {
            jest
                .spyOn(apaczka_1.ApaczkaClient.prototype, "sendOrder")
                .mockRejectedValue(new apaczka_1.ApaczkaApiError(422, "Nieprawidłowy kod pocztowy", "order_send/"));
            const provider = createProvider();
            await expect(provider.createFulfillment(await shippingData(provider), items, order, {
                location_id: "sloc_1",
                delivery_address: shippingAddress,
            })).rejects.toThrow("Apaczka rejected the shipment: Nieprawidłowy kod pocztowy");
        });
    });
    describe("cancelFulfillment", () => {
        it("cancels the Apaczka order", async () => {
            const cancel = jest.spyOn(apaczka_1.ApaczkaClient.prototype, "cancelOrder").mockResolvedValue();
            const result = await createProvider().cancelFulfillment({ apaczka: { state: "created", order_id: 555 } });
            expect(cancel).toHaveBeenCalledWith(555);
            expect(result).toMatchObject({ apaczka: { state: "canceled", status: "canceled" } });
        });
        it("explains why a shipped parcel cannot be canceled", async () => {
            jest.spyOn(apaczka_1.ApaczkaClient.prototype, "cancelOrder").mockRejectedValue(new apaczka_1.ApaczkaApiError(400, "Order in transit", "cancel_order/555/"));
            await expect(createProvider().cancelFulfillment({ apaczka: { state: "created", order_id: 555 } })).rejects.toThrow("cannot be canceled");
        });
        it("does nothing for pending shipments", async () => {
            const cancel = jest.spyOn(apaczka_1.ApaczkaClient.prototype, "cancelOrder");
            await createProvider().cancelFulfillment({ apaczka: { state: "pending", service_id: 21 } });
            expect(cancel).not.toHaveBeenCalled();
        });
    });
    it("defers return labels to the subscriber", async () => {
        const provider = createProvider();
        const option = await optionFor(provider, "apaczka-21-return");
        const result = await provider.createReturnFulfillment({ shipping_option: { data: option } });
        expect(result.data.apaczka).toMatchObject({ state: "pending", is_return: true });
    });
    it("returns label documents", async () => {
        jest.spyOn(apaczka_1.ApaczkaClient.prototype, "getWaybill").mockResolvedValue({ waybill: "QUJD", type: "pdf" });
        const provider = createProvider();
        await expect(provider.retrieveDocuments({ apaczka: { state: "created", order_id: 5 } }, "label")).resolves.toEqual({
            content: "QUJD",
            content_type: "application/pdf",
            file_name: "apaczka-5.pdf",
        });
        await expect(provider.retrieveDocuments({}, "label")).rejects.toThrow("no Apaczka shipment");
        expect(await provider.getFulfillmentDocuments({ apaczka: { state: "created", order_id: 5 } })).toEqual([
            { type: "label", url: "/admin/apaczka/orders/5/documents/waybill" },
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5zcGVjLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9hcGFjemthL19fdGVzdHNfXy9zZXJ2aWNlLnNwZWMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxREFBdUQ7QUFFdkQsa0RBQXFFO0FBQ3JFLDhEQUFzRjtBQUN0Rix3Q0FBOEQ7QUFFOUQsTUFBTSxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUE7QUFFdkYsTUFBTSxRQUFRLEdBQUc7SUFDZixFQUFFLEVBQUUsUUFBUTtJQUNaLElBQUksRUFBRSxTQUFTO0lBQ2YsT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFO0NBQ3hILENBQUE7QUFFRCxNQUFNLGVBQWUsR0FBRztJQUN0QixVQUFVLEVBQUUsTUFBTTtJQUNsQixTQUFTLEVBQUUsT0FBTztJQUNsQixTQUFTLEVBQUUsVUFBVTtJQUNyQixJQUFJLEVBQUUsUUFBUTtJQUNkLFdBQVcsRUFBRSxRQUFRO0lBQ3JCLFlBQVksRUFBRSxJQUFJO0lBQ2xCLEtBQUssRUFBRSxXQUFXO0NBQ25CLENBQUE7QUFFRCxTQUFTLGNBQWMsQ0FBQyxVQUFtQyxFQUFFO0lBQzNELE9BQU8sSUFBSSwyQ0FBaUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFlLEVBQUUsRUFBRTtRQUN4RSxLQUFLLEVBQUUsaUJBQU07UUFDYixTQUFTLEVBQUUscUJBQVU7UUFDckIsTUFBTSxFQUFFLEVB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