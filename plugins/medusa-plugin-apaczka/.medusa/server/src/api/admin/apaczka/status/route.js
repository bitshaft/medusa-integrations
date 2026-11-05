"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const apaczka_1 = require("../../../../lib/apaczka");
const order_builder_1 = require("../../../../lib/order-builder");
const version_1 = require("../../../../lib/version");
const utils_1 = require("../../../utils");
/**
 * `GET /admin/apaczka/status` — connection check for the settings page:
 * environment, whether the credentials work, how many services the account
 * has and how tracking is set up. Never returns secrets.
 */
async function GET(req, res) {
    const apaczka = (0, utils_1.resolveApaczka)(req);
    const options = await apaczka.getOptions();
    const client = await apaczka.getClient();
    let connection;
    try {
        const structure = await (await apaczka.getCatalog()).getServiceStructure({ refresh: req.query.refresh === "true" });
        connection = { ok: true, services: (0, apaczka_1.listServices)(structure).length };
    }
    catch (error) {
        connection = {
            ok: false,
            error: error.message,
            authentication_error: error instanceof apaczka_1.ApaczkaApiError && error.isAuthenticationError,
        };
    }
    res.json({
        version: (0, version_1.packageVersion)(),
        environment: client.environment,
        base_url: client.baseUrl,
        app_id: mask(options.appId),
        connection,
        settings: {
            shipment_creation: options.shipmentCreation,
            label_format: options.labelFormat,
            pickup_type: options.pickup.type,
            pricing_basis: options.pricing.basis,
            insurance: options.insurance.mode,
            cod_account_configured: Boolean(options.cod.bankAccount || options.cod.bankAccountId),
            sender_defaults: Object.keys(options.sender).filter((key) => options.sender[key]),
            sender_locations: Object.keys(options.senderByLocation),
        },
        tracking: {
            webhook_url: options.webhooks.backendUrl ? options.webhooks.backendUrl.replace(/\/+$/, "") + order_builder_1.WEBHOOK_PATH : null,
            polling: options.tracking.polling,
            mark_shipped: options.tracking.markShipped,
            mark_delivered: options.tracking.markDelivered,
        },
    });
}
function mask(value) {
    return value.length <= 8 ? "••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2Evc3RhdHVzL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsa0JBd0NDO0FBbERELHFEQUF1RTtBQUN2RSxpRUFBNEQ7QUFDNUQscURBQXdEO0FBQ3hELDBDQUErQztBQUUvQzs7OztHQUlHO0FBQ0ksS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELE1BQU0sT0FBTyxHQUFHLElBQUEsc0JBQWMsRUFBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQyxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQTtJQUMxQyxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtJQUV4QyxJQUFJLFVBQThGLENBQUE7SUFDbEcsSUFBSSxDQUFDO1FBQ0gsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE1BQU0sT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsbUJBQW1CLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEtBQUssTUFBTSxFQUFFLENBQUMsQ0FBQTtRQUNuSCxVQUFVLEdBQUcsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFBLHNCQUFZLEVBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUE7SUFDckUsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixVQUFVLEdBQUc7WUFDWCxFQUFFLEVBQUUsS0FBSztZQUNULEtBQUssRUFBRyxLQUFlLENBQUMsT0FBTztZQUMvQixvQkFBb0IsRUFBRSxLQUFLLFlBQVkseUJBQWUsSUFBSSxLQUFLLENBQUMscUJBQXFCO1NBQ3RGLENBQUE7SUFDSCxDQUFDO0lBRUQsR0FBRyxDQUFDLElBQUksQ0FBQztRQUNQLE9BQU8sRUFBRSxJQUFBLHdCQUFjLEdBQUU7UUFDekIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxXQUFXO1FBQy9CLFFBQVEsRUFBRSxNQUFNLENBQUMsT0FBTztRQUN4QixNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7UUFDM0IsVUFBVTtRQUNWLFFBQVEsRUFBRTtZQUNSLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0I7WUFDM0MsWUFBWSxFQUFFLE9BQU8sQ0FBQyxXQUFXO1lBQ2pDLFdBQVcsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUk7WUFDaEMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSztZQUNwQyxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJO1lBQ2pDLHNCQUFzQixFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQztZQUNyRixlQUFlLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQWtDLENBQUMsQ0FBQztZQUNoSCxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztTQUN4RDtRQUNELFFBQVEsRUFBRTtZQUNSLFdBQVcsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyw0QkFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJO1lBQ2hILE9BQU8sRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU87WUFDakMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsV0FBVztZQUMxQyxjQUFjLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxhQUFhO1NBQy9DO0tBQ0YsQ0FBQyxDQUFBO0FBQ0osQ0FBQztBQUVELFNBQVMsSUFBSSxDQUFDLEtBQWE7SUFDekIsT0FBTyxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO0FBQ2xGLENBQUMifQ==