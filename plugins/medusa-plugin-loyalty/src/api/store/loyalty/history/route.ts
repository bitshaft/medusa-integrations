import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { customerId, requireEnabled } from "../../../../lib/loyalty/api/utils"

/** `GET /store/loyalty/history?offset=0&limit=20` — the signed-in customer's points history, newest first. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const { offset, limit } = req.validatedQuery as { offset: number; limit: number }
  const [entries, count] = await service.listAndCountLoyaltyEntries(
    { customer_id: customerId(req) },
    {
      select: ["id", "type", "reason", "points", "order_id", "code", "description", "created_at"],
      order: { created_at: "DESC", id: "DESC" },
      skip: offset,
      take: limit,
    }
  )
  res.json({ entries: entries.map((e) => ({ ...e, points: Number(e.points) })), count, offset, limit })
}
