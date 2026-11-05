"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const book_apaczka_pickup_1 = require("../../../../workflows/book-apaczka-pickup");
/** `POST /admin/apaczka/pickups` — book a courier pickup for one or more shipments. */
async function POST(req, res) {
    const { result } = await (0, book_apaczka_pickup_1.bookApaczkaPickupWorkflow)(req.scope).run({ input: req.validatedBody });
    res.status(201).json(result);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2EvcGlja3Vwcy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQU1BLG9CQUdDO0FBUEQsbUZBQXFGO0FBR3JGLHVGQUF1RjtBQUNoRixLQUFLLFVBQVUsSUFBSSxDQUFDLEdBQW1DLEVBQUUsR0FBbUI7SUFDakYsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sSUFBQSwrQ0FBeUIsRUFBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFBO0lBQy9GLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0FBQzlCLENBQUMifQ==