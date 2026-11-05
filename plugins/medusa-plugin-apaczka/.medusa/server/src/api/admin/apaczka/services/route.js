"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const apaczka_1 = require("../../../../lib/apaczka");
const fulfillment_options_1 = require("../../../../lib/fulfillment-options");
const utils_1 = require("../../../utils");
/**
 * `GET /admin/apaczka/services` — the account's services (as shipping
 * option candidates), additional-service options and package types.
 */
async function GET(req, res) {
    const apaczka = (0, utils_1.resolveApaczka)(req);
    const structure = await apaczka.getCatalog().getServiceStructure({ refresh: req.query.refresh === "true" });
    res.json({
        services: (0, fulfillment_options_1.buildFulfillmentOptions)(structure, {
            ...apaczka.getOptions(),
            offerCodVariants: false,
            offerReturnVariants: false,
        }),
        options: Object.entries(structure.options ?? {}).map(([id, option]) => ({ id, ...option })),
        package_types: Object.entries(structure.package_type ?? {}).map(([id, type]) => ({ id, ...type })),
        points_types: (0, apaczka_1.toArray)(structure.points_type),
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2Evc2VydmljZXMvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFVQSxrQkFjQztBQXRCRCxxREFBaUQ7QUFDakQsNkVBQTZFO0FBQzdFLDBDQUErQztBQUUvQzs7O0dBR0c7QUFDSSxLQUFLLFVBQVUsR0FBRyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDL0QsTUFBTSxPQUFPLEdBQUcsSUFBQSxzQkFBYyxFQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ25DLE1BQU0sU0FBUyxHQUFHLE1BQU0sT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxLQUFLLE1BQU0sRUFBRSxDQUFDLENBQUE7SUFFM0csR0FBRyxDQUFDLElBQUksQ0FBQztRQUNQLFFBQVEsRUFBRSxJQUFBLDZDQUF1QixFQUFDLFNBQVMsRUFBRTtZQUMzQyxHQUFHLE9BQU8sQ0FBQyxVQUFVLEVBQUU7WUFDdkIsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixtQkFBbUIsRUFBRSxLQUFLO1NBQzNCLENBQUM7UUFDRixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUMzRixhQUFhLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNsRyxZQUFZLEVBQUUsSUFBQSxpQkFBTyxFQUFDLFNBQVMsQ0FBQyxXQUE0RCxDQUFDO0tBQzlGLENBQUMsQ0FBQTtBQUNKLENBQUMifQ==