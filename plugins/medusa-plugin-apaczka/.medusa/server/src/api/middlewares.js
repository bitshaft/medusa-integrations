"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("@medusajs/framework/http");
const utils_1 = require("./utils");
const validators_1 = require("./validators");
exports.default = (0, http_1.defineMiddlewares)({
    routes: [
        {
            // Signature verification needs the exact bytes Apaczka sent.
            matcher: "/hooks/apaczka/tracking",
            method: ["POST"],
            bodyParser: { preserveRawBody: true, sizeLimit: "256kb" },
        },
        {
            matcher: "/store/apaczka/points",
            method: ["GET"],
            middlewares: [(0, utils_1.validateQuery)(validators_1.StorePointsQuery)],
        },
        {
            matcher: "/store/apaczka/points/:type/:id",
            method: ["GET"],
            middlewares: [(0, utils_1.validateQuery)(validators_1.StorePointQuery)],
        },
        {
            matcher: "/admin/apaczka/shipments",
            method: ["GET"],
            middlewares: [(0, utils_1.validateQuery)(validators_1.AdminShipmentsQuery)],
        },
        {
            matcher: "/admin/apaczka/pickup-hours",
            method: ["GET"],
            middlewares: [(0, utils_1.validateQuery)(validators_1.AdminPickupHoursQuery)],
        },
        {
            matcher: "/admin/apaczka/fulfillments/:id/shipment",
            method: ["POST"],
            middlewares: [(0, http_1.validateAndTransformBody)(validators_1.AdminCreateShipment)],
        },
        {
            matcher: "/admin/apaczka/fulfillments/:id/valuation",
            method: ["POST"],
            middlewares: [(0, http_1.validateAndTransformBody)(validators_1.AdminCreateShipment)],
        },
        {
            matcher: "/admin/apaczka/pickups",
            method: ["POST"],
            middlewares: [(0, http_1.validateAndTransformBody)(validators_1.AdminBookPickup)],
        },
        {
            matcher: "/admin/apaczka/turn-in",
            method: ["POST"],
            middlewares: [(0, http_1.validateAndTransformBody)(validators_1.AdminTurnIn)],
        },
    ],
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWlkZGxld2FyZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvYXBpL21pZGRsZXdhcmVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsbURBQXNGO0FBRXRGLG1DQUF1QztBQUN2Qyw2Q0FRcUI7QUFFckIsa0JBQWUsSUFBQSx3QkFBaUIsRUFBQztJQUMvQixNQUFNLEVBQUU7UUFDTjtZQUNFLDZEQUE2RDtZQUM3RCxPQUFPLEVBQUUseUJBQXlCO1lBQ2xDLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUNoQixVQUFVLEVBQUUsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUU7U0FDMUQ7UUFDRDtZQUNFLE9BQU8sRUFBRSx1QkFBdUI7WUFDaEMsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDO1lBQ2YsV0FBVyxFQUFFLENBQUMsSUFBQSxxQkFBYSxFQUFDLDZCQUFnQixDQUFDLENBQUM7U0FDL0M7UUFDRDtZQUNFLE9BQU8sRUFBRSxpQ0FBaUM7WUFDMUMsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDO1lBQ2YsV0FBVyxFQUFFLENBQUMsSUFBQSxxQkFBYSxFQUFDLDRCQUFlLENBQUMsQ0FBQztTQUM5QztRQUNEO1lBQ0UsT0FBTyxFQUFFLDBCQUEwQjtZQUNuQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQUM7WUFDZixXQUFXLEVBQUUsQ0FBQyxJQUFBLHFCQUFhLEVBQUMsZ0NBQW1CLENBQUMsQ0FBQztTQUNsRDtRQUNEO1lBQ0UsT0FBTyxFQUFFLDZCQUE2QjtZQUN0QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQUM7WUFDZixXQUFXLEVBQUUsQ0FBQyxJQUFBLHFCQUFhLEVBQUMsa0NBQXFCLENBQUMsQ0FBQztTQUNwRDtRQUNEO1lBQ0UsT0FBTyxFQUFFLDBDQUEwQztZQUNuRCxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUM7WUFDaEIsV0FBVyxFQUFFLENBQUMsSUFBQSwrQkFBd0IsRUFBQyxnQ0FBbUIsQ0FBQyxDQUFDO1NBQzdEO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsMkNBQTJDO1lBQ3BELE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUNoQixXQUFXLEVBQUUsQ0FBQyxJQUFBLCtCQUF3QixFQUFDLGdDQUFtQixDQUFDLENBQUM7U0FDN0Q7UUFDRDtZQUNFLE9BQU8sRUFBRSx3QkFBd0I7WUFDakMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDO1lBQ2hCLFdBQVcsRUFBRSxDQUFDLElBQUEsK0JBQXdCLEVBQUMsNEJBQWUsQ0FBQyxDQUFDO1NBQ3pEO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsd0JBQXdCO1lBQ2pDLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUNoQixXQUFXLEVBQUUsQ0FBQyxJQUFBLCtCQUF3QixFQUFDLHdCQUFXLENBQUMsQ0FBQztTQUNyRDtLQUNGO0NBQ0YsQ0FBQyxDQUFBIn0=