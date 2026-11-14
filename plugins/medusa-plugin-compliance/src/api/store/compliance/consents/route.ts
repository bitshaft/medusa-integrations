import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ipHash, optionalCustomerId, requireStoreModule, storeRoute } from "../../../../lib/compliance/api/utils"
import type { StoreConsents, StoreConsentStateQuery } from "../../../../lib/compliance/api/validators"
import { ComplianceError } from "../../../../lib/compliance/messages"
import { recordConsents, subjectState } from "../../../../lib/compliance/server/consents"

/**
 * `GET /store/compliance/consents?anonymous_id=`: the current choices of
 * the signed-in customer, or of a browser (cookie banner). State by e-mail
 * is not shown here, so nobody can look up someone else's consents.
 */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireStoreModule(req, "gdpr")
  const customer = optionalCustomerId(req)
  const { anonymous_id } = req.validatedQuery as unknown as StoreConsentStateQuery
  if (!customer && !anonymous_id) throw new ComplianceError("subject_missing")
  const state = await subjectState(req.scope, customer ? { customer_id: customer } : { anonymous_id })
  res.json({
    consents: state.map((s) => ({
      key: s.type_key,
      granted: s.granted,
      version: s.version,
      latest_version: s.latest_version,
      at: s.at,
      outdated: s.outdated,
    })),
  })
})

/**
 * `POST /store/compliance/consents` with `{ choices: [{ type_key, granted, version }] }`
 * and, when nobody is signed in, `anonymous_id` (cookies) or `email`
 * (e.g. a newsletter form). Withdrawing is a new entry; nothing is erased.
 */
export const POST = storeRoute(async (req: MedusaRequest<StoreConsents>, res: MedusaResponse) => {
  await requireStoreModule(req, "gdpr")
  const body = req.validatedBody
  const customer = optionalCustomerId(req)
  const created = await recordConsents(req.scope, {
    subject: customer
      ? { customer_id: customer, anonymous_id: body.anonymous_id ?? null }
      : { email: body.email ?? null, anonymous_id: body.anonymous_id ?? null },
    stateSubject: customer
      ? { customer_id: customer }
      : body.email
        ? { email: body.email }
        : { anonymous_id: body.anonymous_id },
    choices: body.choices,
    source: "storefront",
    placement: body.placement ?? null,
    actor: { type: "customer", id: customer },
    ip_hash: await ipHash(req),
  })
  res.status(201).json({ recorded: created.length })
})
