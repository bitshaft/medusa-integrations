import { model } from "@medusajs/framework/utils"

import { STATUSES } from "../../../lib/whitelist-vat/verdict"

/**
 * A business the store has verified: the latest verdict and company data
 * per tax ID. It is the cache that keeps repeat checks away from the
 * registers, and the list of contractors in the admin.
 */
export const WhitelistVatSubject = model
  .define("whitelist_vat_subject", {
    id: model.id({ prefix: "wvsub" }).primaryKey(),
    /** Canonical tax ID: `5260250274` for a Polish NIP, `DE123456789` for EU VAT. */
    number: model.text().searchable(),
    kind: model.enum(["nip", "eu_vat"]),
    country_code: model.text(),
    status: model.enum([...STATUSES]).default("unverified"),
    name: model.text().searchable().nullable(),
    address: model.text().searchable().nullable(),
    /** Company data merged from the registers (see `CompanyData`). */
    company: model.json().nullable(),
    /** Last answer of each register (see `SourceStates`). */
    sources: model.json().nullable(),
    bank_account_count: model.number().default(0),
    /** The customer who last used this tax ID, when known. */
    customer_id: model.text().nullable(),
    /** Last time at least one register answered. `null`: never verified. */
    checked_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["number"], unique: true, where: "deleted_at IS NULL" },
    { on: ["status"], where: "deleted_at IS NULL" },
    { on: ["customer_id"], where: "deleted_at IS NULL AND customer_id IS NOT NULL" },
  ])
