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
    const options = apaczka.getOptions();
    const client = apaczka.getClient();
    let connection;
    try {
        const structure = await apaczka.getCatalog().getServiceStructure({ refresh: req.query.refresh === "true" });
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
            webhook_url: options.webhooks.backendUrl
                ? options.webhooks.backendUrl.replace(/\/+$/, "") + order_builder_1.WEBHOOK_PATH
                : null,
            polling: options.tracking.polling,
            mark_shipped: options.tracking.markShipped,
            mark_delivered: options.tracking.markDelivered,
        },
    });
}
function mask(value) {
    return value.length <= 8 ? "••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2Evc3RhdHVzL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsa0JBMENDO0FBcERELHFEQUF1RTtBQUN2RSxpRUFBNEQ7QUFDNUQscURBQXdEO0FBQ3hELDBDQUErQztBQUUvQzs7OztHQUlHO0FBQ0ksS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELE1BQU0sT0FBTyxHQUFHLElBQUEsc0JBQWMsRUFBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUE7SUFDcEMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFBO0lBRWxDLElBQUksVUFBOEYsQ0FBQTtJQUNsRyxJQUFJLENBQUM7UUFDSCxNQUFNLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sS0FBSyxNQUFNLEVBQUUsQ0FBQyxDQUFBO1FBQzNHLFVBQVUsR0FBRyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUEsc0JBQVksRUFBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQTtJQUNyRSxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLFVBQVUsR0FBRztZQUNYLEVBQUUsRUFBRSxLQUFLO1lBQ1QsS0FBSyxFQUFHLEtBQWUsQ0FBQyxPQUFPO1lBQy9CLG9CQUFvQixFQUFFLEtBQUssWUFBWSx5QkFBZSxJQUFJLEtBQUssQ0FBQyxxQkFBcUI7U0FDdEYsQ0FBQTtJQUNILENBQUM7SUFFRCxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQ1AsT0FBTyxFQUFFLElBQUEsd0JBQWMsR0FBRTtRQUN6QixXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVc7UUFDL0IsUUFBUSxFQUFFLE1BQU0sQ0FBQyxPQUFPO1FBQ3hCLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUMzQixVQUFVO1FBQ1YsUUFBUSxFQUFFO1lBQ1IsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLGdCQUFnQjtZQUMzQyxZQUFZLEVBQUUsT0FBTyxDQUFDLFdBQVc7WUFDakMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSTtZQUNoQyxhQUFhLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLO1lBQ3BDLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUk7WUFDakMsc0JBQXNCLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDO1lBQ3JGLGVBQWUsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBa0MsQ0FBQyxDQUFDO1lBQ2hILGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDO1NBQ3hEO1FBQ0QsUUFBUSxFQUFFO1lBQ1IsV0FBVyxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsVUFBVTtnQkFDdEMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEdBQUcsNEJBQVk7Z0JBQ2hFLENBQUMsQ0FBQyxJQUFJO1lBQ1IsT0FBTyxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTztZQUNqQyxZQUFZLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQzFDLGNBQWMsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLGFBQWE7U0FDL0M7S0FDRixDQUFDLENBQUE7QUFDSixDQUFDO0FBRUQsU0FBUyxJQUFJLENBQUMsS0FBYTtJQUN6QixPQUFPLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7QUFDbEYsQ0FBQyJ9