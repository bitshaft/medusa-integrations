import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { threadDetail } from "../../../../../lib/negotiations/api/admin"
import { actorId, adminRoute, parse } from "../../../../../lib/negotiations/api/utils"
import { AdminMessage } from "../../../../../lib/negotiations/api/validators"
import { teamNote, teamReply } from "../../../../../lib/negotiations/server/threads"

/** `POST /admin/negotiations/:id/messages`: a reply to the customer, or an internal note (`type: "internal_note"`). */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(AdminMessage, req.body)
  const ctx = { container: req.scope }
  const { thread } =
    input.type === "internal_note"
      ? await teamNote(ctx, actorId(req), req.params.id, input)
      : await teamReply(ctx, actorId(req), req.params.id, input)
  res.json(await threadDetail(req, thread))
})
