"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fulfillment_options_1 = require("../fulfillment-options");
const fixtures_1 = require("./fixtures");
describe("fulfillment options", () => {
    it("builds standard, COD and return variants", () => {
        const result = (0, fulfillment_options_1.buildFulfillmentOptions)(fixtures_1.serviceStructure, (0, fixtures_1.options)());
        // Sorted by supplier and name: "DPD Europe" < "DPD Kurier" < "INPOST Paczkomat".
        expect(result.map((o) => o.id)).toEqual([
            "apaczka-22",
            "apaczka-22-cod",
            "apaczka-22-return",
            "apaczka-21",
            "apaczka-21-cod",
            "apaczka-21-return",
            "apaczka-41",
            "apaczka-41-cod",
        ]);
    });
    it("maps service flags", () => {
        const courier = (0, fulfillment_options_1.buildFulfillmentOptions)(fixtures_1.serviceStructure, (0, fixtures_1.options)()).find((o) => o.id === "apaczka-21");
        expect(courier).toMatchObject({
            service_id: 21,
            name: "DPD Kurier",
            supplier: "DPD",
            origin: "door",
            destination: "door",
            domestic: true,
            pickup_courier: 1,
            points_type: "DPD",
        });
        const locker = (0, fulfillment_options_1.buildFulfillmentOptions)(fixtures_1.serviceStructure, (0, fixtures_1.options)()).find((o) => o.id === "apaczka-41");
        expect(locker).toMatchObject({ origin: "point", destination: "point", pickup_courier: 0, points_type: "INPOST" });
        const international = (0, fulfillment_options_1.buildFulfillmentOptions)(fixtures_1.serviceStructure, (0, fixtures_1.options)()).find((o) => o.id === "apaczka-22");
        expect(international).toMatchObject({ domestic: false, pickup_courier: 2 });
    });
    it("respects enabledServices, variant switches and custom names", () => {
        const result = (0, fulfillment_options_1.buildFulfillmentOptions)(fixtures_1.serviceStructure, (0, fixtures_1.options)({
            enabledServices: [41],
            offerCodVariants: false,
            services: { "41": { name: "Paczkomat InPost 24/7" } },
        }));
        expect(result).toEqual([expect.objectContaining({ id: "apaczka-41", name: "Paczkomat InPost 24/7" })]);
    });
    it("parses stored option data and rejects foreign data", () => {
        const [option] = (0, fulfillment_options_1.buildFulfillmentOptions)(fixtures_1.serviceStructure, (0, fixtures_1.options)());
        expect((0, fulfillment_options_1.parseFulfillmentOption)(JSON.parse(JSON.stringify(option)))).toEqual(option);
        expect((0, fulfillment_options_1.parseFulfillmentOption)({ id: "manual-fulfillment" })).toBeUndefined();
        expect((0, fulfillment_options_1.parseFulfillmentOption)(null)).toBeUndefined();
        expect((0, fulfillment_options_1.parseFulfillmentOption)({ id: "apaczka-x", service_id: "abc" })).toBeUndefined();
    });
    it("resolves point types", () => {
        expect((0, fulfillment_options_1.resolvePointsType)("INPOST", {}, ["INPOST"])).toBe("INPOST");
        expect((0, fulfillment_options_1.resolvePointsType)("POCZTA POLSKA", {}, ["POCZTA"])).toBe("POCZTA");
        expect((0, fulfillment_options_1.resolvePointsType)("ORLEN", { ORLEN: "PWR" }, [])).toBe("PWR");
        expect((0, fulfillment_options_1.resolvePointsType)("GLS", {}, [])).toBe("GLS");
        expect((0, fulfillment_options_1.resolvePointsType)("", {}, [])).toBeUndefined();
    });
    it("builds stable IDs", () => {
        expect((0, fulfillment_options_1.fulfillmentOptionId)(41, "standard")).toBe("apaczka-41");
        expect((0, fulfillment_options_1.fulfillmentOptionId)(41, "cod")).toBe("apaczka-41-cod");
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnVsZmlsbG1lbnQtb3B0aW9ucy5zcGVjLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL2xpYi9fX3Rlc3RzX18vZnVsZmlsbG1lbnQtb3B0aW9ucy5zcGVjLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsZ0VBSytCO0FBQy9CLHlDQUFzRDtBQUV0RCxRQUFRLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBQ25DLEVBQUUsQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7UUFDbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSw2Q0FBdUIsRUFBQywyQkFBZ0IsRUFBRSxJQUFBLGtCQUFPLEdBQUUsQ0FBQyxDQUFBO1FBQ25FLGlGQUFpRjtRQUNqRixNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1lBQ3RDLFlBQVk7WUFDWixnQkFBZ0I7WUFDaEIsbUJBQW1CO1lBQ25CLFlBQVk7WUFDWixnQkFBZ0I7WUFDaEIsbUJBQW1CO1lBQ25CLFlBQVk7WUFDWixnQkFBZ0I7U0FDakIsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixFQUFFLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO1FBQzVCLE1BQU0sT0FBTyxHQUFHLElBQUEsNkNBQXVCLEVBQUMsMkJBQWdCLEVBQUUsSUFBQSxrQkFBTyxHQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssWUFBWSxDQUFDLENBQUE7UUFDdkcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLGFBQWEsQ0FBQztZQUM1QixVQUFVLEVBQUUsRUFBRTtZQUNkLElBQUksRUFBRSxZQUFZO1lBQ2xCLFFBQVEsRUFBRSxLQUFLO1lBQ2YsTUFBTSxFQUFFLE1BQU07WUFDZCxX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