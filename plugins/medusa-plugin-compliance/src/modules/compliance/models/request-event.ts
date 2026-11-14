import { model } from "@medusajs/framework/utils"

import { REQUEST_ACTIONS } from "../../../lib/compliance/types"

/** Who did what to a request, and when. Append-only. */
export const ComplianceRequestEvent = model
  .define("compliance_request_event", {
    id: model.id({ prefix: "crev" }).primaryKey(),
    request_id: model.text(),
    action: model.enum([...REQUEST_ACTIONS]),
    actor_type: model.text(),
    actor_id: model.text().nullable(),
    /** Reason for a rejection, or a note. */
    note: model.text().nullable(),
    data: model.json().nullable(),
  })
  .indexes([
    { name: "IDX_compliance_request_event_request", on: ["request_id", "created_at"], where: "deleted_at IS NULL" },
  ])
