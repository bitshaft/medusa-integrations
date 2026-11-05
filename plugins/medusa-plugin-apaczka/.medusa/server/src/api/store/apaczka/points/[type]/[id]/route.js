"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const utils_1 = require("@medusajs/framework/utils");
const points_1 = require("../../../../../../lib/points");
const utils_2 = require("../../../../../utils");
/** `GET /store/apaczka/points/INPOST/WAW01M` — one point, e.g. to show the saved choice. */
async function GET(req, res) {
    const { country_code } = req.validatedQuery;
    const point = await (await (0, utils_2.resolveApaczka)(req).getCatalog()).findPoint(req.params.type, req.params.id, country_code);
    if (!point) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `Point ${req.params.id} was not found`);
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ point: (0, points_1.toPublicPoint)(point) });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2FwYWN6a2EvcG9pbnRzL1t0eXBlXS9baWRdL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBUUEsa0JBVUM7QUFqQkQscURBQXVEO0FBRXZELHlEQUE0RDtBQUM1RCxnREFBcUQ7QUFHckQsNEZBQTRGO0FBQ3JGLEtBQUssVUFBVSxHQUFHLENBQUMsR0FBNEMsRUFBRSxHQUFtQjtJQUN6RixNQUFNLEVBQUUsWUFBWSxFQUFFLEdBQUcsR0FBRyxDQUFDLGNBQWlDLENBQUE7SUFDOUQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sSUFBQSxzQkFBYyxFQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFBO0lBRXBILElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE1BQU0sSUFBSSxtQkFBVyxDQUFDLG1CQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxTQUFTLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFBO0lBQzVGLENBQUM7SUFFRCxHQUFHLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO0lBQ3JELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBQSxzQkFBYSxFQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQTtBQUMzQyxDQUFDIn0=