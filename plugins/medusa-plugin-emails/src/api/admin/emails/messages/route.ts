import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeMessage, resolveEnabled } from "../../../../lib/emails/api/utils"
import type { AdminMessagesQueryParams } from "../../../../lib/emails/api/validators"
import type { MessageRecord } from "../../../../modules/emails/service"

/**
 * `GET /admin/emails/messages` — the send log, newest first. Filter by
 * `order_id`, `customer_id`, `type`, `status` or search recipients with `q`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { emails, options } = await resolveEnabled(req)
  const { limit, offset, q, ...filters } = req.validatedQuery as unknown as AdminMessagesQueryParams

  const [messages, count] = await emails.listAndCountEmailsMessages(
    { ...filters, ...(q ? { q } : {}) },
    { take: limit, skip: offset, order: { created_at: "DESC" } }
  )

  res.json({
    messages: (messages as unknown as MessageRecord[]).map((message) => describeMessage(options, message)),
    count,
    limit,
    offset,
  })
}
