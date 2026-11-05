"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const utils_2 = require("../../../utils");
/**
 * `POST /admin/apaczka/turn-in` — collective hand-over (turn-in) confirmation
 * PDF for the given shipments, signed by the courier at pickup.
 */
async function POST(req, res) {
    const apaczka = (0, utils_2.resolveApaczka)(req);
    const shipments = await apaczka.listApaczkaShipments({ id: req.validatedBody.shipment_ids });
    const orderIds = shipments.map((s) => s.apaczka_order_id).filter((id) => Boolean(id));
    if (!orderIds.length) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "None of the selected shipments exist in Apaczka yet");
    }
    const { turn_in } = await apaczka.getClient().getTurnIn(orderIds);
    (0, utils_2.sendDocument)(res, {
        base64: turn_in,
        contentType: "application/pdf",
        fileName: `apaczka-turn-in-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2EvdHVybi1pbi9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVVBLG9CQWVDO0FBeEJELHFEQUF1RDtBQUV2RCwwQ0FBNkQ7QUFHN0Q7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLElBQUksQ0FBQyxHQUErQixFQUFFLEdBQW1CO0lBQzdFLE1BQU0sT0FBTyxHQUFHLElBQUEsc0JBQWMsRUFBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQyxNQUFNLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUE7SUFDNUYsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFnQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7SUFFbkcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNyQixNQUFNLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUscURBQXFELENBQUMsQ0FBQTtJQUM5RyxDQUFDO0lBRUQsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLE1BQU0sT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQTtJQUNqRSxJQUFBLG9CQUFZLEVBQUMsR0FBRyxFQUFFO1FBQ2hCLE1BQU0sRUFBRSxPQUFPO1FBQ2YsV0FBVyxFQUFFLGlCQUFpQjtRQUM5QixRQUFRLEVBQUUsbUJBQW1CLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsTUFBTTtLQUN6RSxDQUFDLENBQUE7QUFDSixDQUFDIn0=