import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { addDays } from "../format"
import { ComplianceError } from "../messages"
import {
  type AdminAction,
  canDo,
  deadlineFor,
  hashToken,
  isDueSoon,
  newToken,
  nextStatus,
  normalizeEmail,
  OPEN_STATUSES,
  rateLimitWait,
} from "../requests"
import type { Locale, RequestAction, RequestStatus, RequestType } from "../types"
import { type Actor, loadConsentTypes, recordConsents, subjectState } from "./consents"
import { ComplianceEvents, emit, graph, resolveCompliance } from "./runtime"

type Row = Record<string, any>

export async function addRequestEvent(
  container: MedusaContainer,
  requestId: string,
  action: RequestAction,
  actor: Actor,
  note: string | null = null,
  data: Row | null = null
) {
  await resolveCompliance(container).createComplianceRequestEvents({
    request_id: requestId,
    action,
    actor_type: actor.type,
    actor_id: actor.id,
    note,
    data,
  } as never)
}

/** A signed-in customer id behind an e-mail address, if there is an account. */
async function customerByEmail(container: MedusaContainer, email: string): Promise<string | null> {
  const { data } = await graph(container)({
    entity: "customer",
    fields: ["id", "has_account"],
    filters: { email },
  })
  return (data.find((c: Row) => c.has_account) ?? data[0])?.id ?? null
}

/**
 * A new request from the storefront. It waits for the e-mail link: the
 * token goes out in `compliance.request_verification` (another plugin sends
 * the e-mail) and only its hash is stored.
 */
export async function submitRequest(
  container: MedusaContainer,
  input: {
    type: RequestType
    email?: string | null
    customer_id?: string | null
    details?: string | null
    locale: Locale
    ip_hash: string | null
    now?: Date
  }
) {
  const service = resolveCompliance(container)
  const settings = await service.getSettings()
  const now = input.now ?? new Date()

  let email = input.email ? normalizeEmail(input.email) : null
  let customerId = input.customer_id ?? null
  if (customerId) {
    const { data } = await graph(container)({
      entity: "customer",
      fields: ["id", "email"],
      filters: { id: customerId },
    })
    email = data[0]?.email ? normalizeEmail(data[0].email) : email
  }
  if (!email) throw new ComplianceError("email_required")
  customerId = customerId ?? (await customerByEmail(container, email))

  const windowStart = new Date(now.getTime() - settings.gdpr.rate_limit.window_minutes * 60_000)
  const or: Row[] = [{ email }]
  if (input.ip_hash) or.push({ ip_hash: input.ip_hash })
  const recent = await service.listComplianceRequests(
    { $or: or, created_at: { $gt: windowStart } },
    { select: ["email", "ip_hash", "created_at"] }
  )
  const wait = rateLimitWait(
    recent.map((r) => ({ email: r.email, ip_hash: r.ip_hash ?? null, created_at: new Date(r.created_at) })),
    { email, ip_hash: input.ip_hash },
    settings.gdpr.rate_limit,
    now
  )
  if (wait > 0) throw new ComplianceError("rate_limited", { minutes: wait })

  const { token, hash } = newToken()
  const expiresAt = new Date(now.getTime() + settings.gdpr.token_hours * 3_600_000)
  const request = (await service.createComplianceRequests({
    type: input.type,
    status: "unverified",
    customer_id: customerId,
    email,
    locale: input.locale,
    details: input.details ?? null,
    token_hash: hash,
    token_expires_at: expiresAt,
    ip_hash: input.ip_hash,
  } as never)) as unknown as Row
  await addRequestEvent(container, request.id, "submitted", {
    type: customerId && input.customer_id ? "customer" : "system",
    id: input.customer_id ?? null,
  })
  await emit(container, ComplianceEvents.REQUEST_VERIFICATION, {
    id: request.id,
    type: input.type,
    email,
    customer_id: customerId,
    locale: input.locale,
    token,
    verify_url: settings.gdpr.verify_url
      ? settings.gdpr.verify_url.replace("{token}", encodeURIComponent(token))
      : null,
    expires_at: expiresAt.toISOString(),
  })
  return { id: request.id, status: "unverified" as RequestStatus, expires_at: expiresAt }
}

/** The e-mail link was opened: the request becomes open and gets its deadline. */
export async function verifyRequest(container: MedusaContainer, token: string, now = new Date()) {
  const service = resolveCompliance(container)
  const settings = await service.getSettings()
  const [request] = await service.listComplianceRequests({ token_hash: hashToken(token) })
  if (!request || request.status !== "unverified" || !request.token_expires_at)
    throw new ComplianceError("token_invalid")
  if (new Date(request.token_expires_at).getTime() < now.getTime()) throw new ComplianceError("token_invalid")

  const deadline = deadlineFor(now, settings.gdpr.response_days)
  const updated = await service.transitionRequest(request.id, ["unverified"], {
    status: "open",
    verified_at: now,
    deadline_at: deadline,
    token_hash: null,
    token_expires_at: null,
  })
  if (!updated) throw new ComplianceError("token_invalid")
  await addRequestEvent(container, request.id, "verified", { type: "customer", id: request.customer_id ?? null })
  await emit(container, ComplianceEvents.REQUEST_OPENED, {
    id: request.id,
    type: request.type,
    email: request.email,
    customer_id: request.customer_id,
    deadline_at: deadline.toISOString(),
  })
  return { id: request.id, type: request.type as RequestType, status: "open" as RequestStatus, deadline_at: deadline }
}

export async function getRequest(container: MedusaContainer, id: string) {
  const service = resolveCompliance(container)
  const [request] = await service.listComplianceRequests({ id })
  if (!request) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Request ${id} was not found.`)
  const events = await service.listComplianceRequestEvents({ request_id: id }, { order: { created_at: "ASC" } })
  return { request: request as Row, events: events as Row[] }
}

/**
 * Accept, reject (a reason is required), complete or note a request. A
 * status change happens only if the request is still in the state the admin
 * saw, so two people cannot act on it at once.
 */
export async function actOnRequest(
  container: MedusaContainer,
  id: string,
  action: Exclude<AdminAction, "export" | "anonymize">,
  actor: Actor,
  note: string | null
) {
  const { request } = await getRequest(container, id)
  const status = request.status as RequestStatus
  if (!canDo(status, action, request.type)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `A ${status} request cannot be ${action}ed.`)
  }
  if (action === "reject" && !note?.trim()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Give a reason for the rejection; it is kept in the history.")
  }
  if (action === "note") {
    if (!note?.trim()) throw new MedusaError(MedusaError.Types.INVALID_DATA, "The note is empty.")
    await addRequestEvent(container, id, "noted", actor, note.trim())
    return getRequest(container, id)
  }
  const target = nextStatus(status, action)
  const final = target === "completed" || target === "rejected"
  const updated = await resolveCompliance(container).transitionRequest(id, [status], {
    status: target,
    ...(final ? { closed_at: new Date() } : {}),
  })
  if (!updated) throw new MedusaError(MedusaError.Types.CONFLICT, "Someone else changed this request. Reload it.")
  const eventAction: RequestAction = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "completed"
  await addRequestEvent(container, id, eventAction, actor, note?.trim() || null)

  // An accepted objection to marketing withdraws marketing consents at once.
  if (action === "accept" && request.type === "objection") await withdrawMarketing(container, request, actor)
  if (final) {
    await emit(container, ComplianceEvents.REQUEST_CLOSED, {
      id,
      type: request.type,
      status: target,
      email: request.email,
      customer_id: request.customer_id,
      reason: action === "reject" ? note : null,
    })
  }
  return getRequest(container, id)
}

/** Withdraws newsletter and marketing-cookie consents of the request's person. */
async function withdrawMarketing(container: MedusaContainer, request: Row, actor: Actor) {
  const { types } = await loadConsentTypes(container, { activeOnly: true })
  const marketing = types.filter((t) => t.placement === "newsletter" || t.cookie_category === "marketing")
  const subject = { customer_id: request.customer_id, email: request.email }
  const state = await subjectState(container, subject)
  const choices = marketing
    .filter((t) => state.find((s) => s.type_key === t.key)?.granted)
    .map((t) => ({ type_key: t.key, granted: false }))
  if (!choices.length) return
  await recordConsents(container, { subject, choices, source: "admin", actor })
  await addRequestEvent(container, request.id, "noted", actor, null, { withdrawn: choices.map((c) => c.type_key) })
}

/**
 * Daily: unverified requests whose link expired become `expired`; open
 * requests close to their deadline get one warning event.
 */
export async function reviewRequests(container: MedusaContainer, now = new Date()) {
  const service = resolveCompliance(container)
  const settings = await service.getSettings()
  const system: Actor = { type: "system", id: null }

  const stale = await service.listComplianceRequests({ status: "unverified", token_expires_at: { $lt: now } })
  for (const request of stale) {
    const updated = await service.transitionRequest(request.id, ["unverified"], {
      status: "expired",
      closed_at: now,
      token_hash: null,
    })
    if (updated) await addRequestEvent(container, request.id, "expired", system)
  }

  const warnBefore = addDays(now, settings.gdpr.warn_days)
  const due = await service.listComplianceRequests({
    status: OPEN_STATUSES,
    reminded_at: null,
    deadline_at: { $lte: warnBefore },
  })
  let warned = 0
  for (const request of due) {
    if (!isDueSoon(request.deadline_at ? new Date(request.deadline_at) : null, now, settings.gdpr.warn_days)) continue
    const updated = await service.transitionRequest(request.id, OPEN_STATUSES, { reminded_at: now })
    if (!updated) continue
    warned++
    await addRequestEvent(container, request.id, "due_soon", system)
    await emit(container, ComplianceEvents.REQUEST_DUE_SOON, {
      id: request.id,
      type: request.type,
      email: request.email,
      deadline_at: new Date(request.deadline_at!).toISOString(),
    })
  }
  return { expired: stale.length, warned }
}
