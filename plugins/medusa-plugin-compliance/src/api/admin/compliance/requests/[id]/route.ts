import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminActor, isDemo, requireModule } from "../../../../../lib/compliance/api/utils"
import type { AdminRequestAction } from "../../../../../lib/compliance/api/validators"
import { demoRequestEvents, demoRequests } from "../../../../../lib/compliance/demo"
import { daysLeft } from "../../../../../lib/compliance/requests"
import { eraseForRequest, erasurePreview } from "../../../../../lib/compliance/server/erasure"
import { actOnRequest, getRequest } from "../../../../../lib/compliance/server/requests"
import { MedusaError } from "@medusajs/framework/utils"

type Row = Record<string, any>

const SAFE = ["token_hash", "token_expires_at", "ip_hash"]
const clean = (request: Row) => Object.fromEntries(Object.entries(request).filter(([k]) => !SAFE.includes(k)))

async function view(req: MedusaRequest, result: { request: Row; events: Row[] }) {
  const request = clean(result.request)
  const open = request.status === "open" || request.status === "accepted"
  return {
    demo: false,
    request: {
      ...request,
      days_left: open && request.deadline_at ? daysLeft(new Date(request.deadline_at), new Date()) : null,
    },
    events: result.events,
    erasure: request.type === "erasure" && open ? await erasurePreview(req.scope, request.id) : null,
  }
}

/** `GET /admin/compliance/requests/:id`: the request, its history and, for erasures, what will be touched. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireModule(req, "gdpr")
  if (await isDemo(req)) {
    const request = demoRequests().find((r) => r.id === req.params.id)
    if (!request) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Request ${req.params.id} was not found.`)
    const open = request.status === "open" || request.status === "accepted"
    res.json({
      demo: true,
      request: { ...request, days_left: open ? daysLeft(new Date(request.deadline_at!), new Date()) : null },
      events: demoRequestEvents(request.id),
      erasure:
        request.type === "erasure" && open
          ? { customer: { id: request.customer_id, email: request.email }, orders: 3, open_orders: 1, already: false }
          : null,
    })
    return
  }
  res.json(await view(req, await getRequest(req.scope, req.params.id)))
}

/**
 * `POST /admin/compliance/requests/:id` with `{ action, note }`:
 * accept, reject (note required), complete, note, or anonymize (accepted
 * erasure requests; also completes the request).
 */
export async function POST(req: MedusaRequest<AdminRequestAction>, res: MedusaResponse) {
  await requireModule(req, "gdpr")
  const { action, note } = req.validatedBody
  const actor = adminActor(req)
  const result =
    action === "anonymize"
      ? await eraseForRequest(req.scope, req.params.id, actor)
      : await actOnRequest(req.scope, req.params.id, action, actor, note)
  res.json(await view(req, result))
}
