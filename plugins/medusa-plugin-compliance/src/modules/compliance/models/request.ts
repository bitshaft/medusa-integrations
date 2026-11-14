import { model } from "@medusajs/framework/utils"

import { REQUEST_STATUSES, REQUEST_TYPES } from "../../../lib/compliance/types"

/**
 * A data subject request. The database lets only the status fields change
 * and never deletes a request; what happened is in the request events.
 */
export const ComplianceRequest = model
  .define("compliance_request", {
    id: model.id({ prefix: "creq" }).primaryKey(),
    type: model.enum([...REQUEST_TYPES]),
    status: model.enum([...REQUEST_STATUSES]).default("unverified"),
    customer_id: model.text().nullable(),
    email: model.text(),
    locale: model.text().default("pl"),
    /** What the person wrote, e.g. which data to correct. */
    details: model.text().nullable(),
    token_hash: model.text().nullable(),
    token_expires_at: model.dateTime().nullable(),
    ip_hash: model.text().nullable(),
    verified_at: model.dateTime().nullable(),
    deadline_at: model.dateTime().nullable(),
    closed_at: model.dateTime().nullable(),
    reminded_at: model.dateTime().nullable(),
  })
  .indexes([
    { name: "IDX_compliance_request_status", on: ["status", "deadline_at"], where: "deleted_at IS NULL" },
    { name: "IDX_compliance_request_email", on: ["email", "created_at"], where: "deleted_at IS NULL" },
    { name: "IDX_compliance_request_ip", on: ["ip_hash", "created_at"], where: "deleted_at IS NULL" },
    { name: "IDX_compliance_request_token", on: ["token_hash"], where: "deleted_at IS NULL" },
    { name: "IDX_compliance_request_customer", on: ["customer_id"], where: "deleted_at IS NULL" },
  ])
