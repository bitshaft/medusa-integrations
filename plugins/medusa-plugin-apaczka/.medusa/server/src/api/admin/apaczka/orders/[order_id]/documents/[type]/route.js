"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const utils_1 = require("@medusajs/framework/utils");
const utils_2 = require("../../../../../../utils");
const TYPES = ["waybill", "dispatch_code"];
/**
 * `GET /admin/apaczka/orders/:order_id/documents/waybill` — the shipping
 * label (PDF or ZPL). This is the `label_url` stored on Medusa fulfillments.
 *
 * `GET /admin/apaczka/orders/:order_id/documents/dispatch_code` — the drop-off
 * code some carriers require (JSON).
 *
 * Only orders created by this store are served, so the endpoint cannot be
 * used to browse other orders on the same Apaczka account.
 */
async function GET(req, res) {
    const { order_id: orderId, type } = req.params;
    if (!TYPES.includes(type)) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Unknown document type "${type}"`);
    }
    const apaczka = (0, utils_2.resolveApaczka)(req);
    const [shipment] = await apaczka.listApaczkaShipments({ apaczka_order_id: orderId }, { take: 1 });
    if (!shipment) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `No shipment with Apaczka order ${orderId} in this store`);
    }
    const client = await apaczka.getClient();
    if (type === "dispatch_code") {
        const result = await client.getDispatchCode(orderId);
        return res.json({ order_id: orderId, dispatch_code: result.dispatch_code ?? null });
    }
    const waybill = await client.getWaybill(orderId);
    const isZpl = waybill.type?.toLowerCase() === "zpl";
    (0, utils_2.sendDocument)(res, {
        base64: waybill.waybill,
        contentType: isZpl ? "application/zpl" : "application/pdf",
        fileName: `apaczka-${shipment.waybill_number ?? orderId}.${isZpl ? "zpl" : "pdf"}`,
        inline: !isZpl && req.query.download !== "true",
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2Evb3JkZXJzL1tvcmRlcl9pZF0vZG9jdW1lbnRzL1t0eXBlXS9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWlCQSxrQkEyQkM7QUEzQ0QscURBQXVEO0FBRXZELG1EQUFzRTtBQUV0RSxNQUFNLEtBQUssR0FBRyxDQUFDLFNBQVMsRUFBRSxlQUFlLENBQVUsQ0FBQTtBQUVuRDs7Ozs7Ozs7O0dBU0c7QUFDSSxLQUFLLFVBQVUsR0FBRyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDL0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQTtJQUM5QyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUE4QixDQUFDLEVBQUUsQ0FBQztRQUNwRCxNQUFNLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsMEJBQTBCLElBQUksR0FBRyxDQUFDLENBQUE7SUFDMUYsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFHLElBQUEsc0JBQWMsRUFBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsb0JBQW9CLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBQ2pHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLE1BQU0sSUFBSSxtQkFBVyxDQUFDLG1CQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxrQ0FBa0MsT0FBTyxnQkFBZ0IsQ0FBQyxDQUFBO0lBQy9HLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtJQUV4QyxJQUFJLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztRQUM3QixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDcEQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWEsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFBO0lBQ3JGLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU0sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUE7SUFDaEQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxLQUFLLENBQUE7SUFDbkQsSUFBQSxvQkFBWSxFQUFDLEdBQUcsRUFBRTtRQUNoQixNQUFNLEVBQUUsT0FBTyxDQUFDLE9BQU87UUFDdkIsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtRQUMxRCxRQUFRLEVBQUUsV0FBVyxRQUFRLENBQUMsY0FBYyxJQUFJLE9BQU8sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFO1FBQ2xGLE1BQU0sRUFBRSxDQUFDLEtBQUssSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsS0FBSyxNQUFNO0tBQ2hELENBQUMsQ0FBQTtBQUNKLENBQUMifQ==