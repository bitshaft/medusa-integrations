import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import { anonymizeComplianceCustomerWorkflow } from "../../../workflows/compliance/anonymize-compliance-customer"
import { anonymizedAddress } from "../anonymize"
import { canDo } from "../requests"
import type { RequestStatus } from "../types"
import type { Actor } from "./consents"
import { actOnRequest, addRequestEvent, getRequest } from "./requests"
import { graph, logger, resolveCompliance } from "./runtime"

type Row = Record<string, any>

/** What the admin sees before confirming an erasure: what will be touched and what stops it. */
export async function erasurePreview(container: MedusaContainer, requestId: string) {
  const { request } = await getRequest(container, requestId)
  if (!request.customer_id) return { customer: null, orders: 0, open_orders: 0, already: false }
  const [customer] = (
    await graph(container)({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "has_account"],
      filters: { id: request.customer_id },
    })
  ).data
  const { data: orders } = await graph(container)({
    entity: "order",
    fields: ["id", "status", "fulfillment_status", "payment_status"],
    filters: { customer_id: request.customer_id },
  })
  const open = orders.filter(
    (o: Row) => !["completed", "canceled", "archived"].includes(o.status) && o.fulfillment_status !== "delivered"
  )
  const already = (
    await resolveCompliance(container).listComplianceAnonymizations({ customer_id: request.customer_id })
  ).length
  return { customer: customer ?? null, orders: orders.length, open_orders: open.length, already: already > 0 }
}

/**
 * Carries out an accepted erasure request: anonymises the customer and
 * completes the request. A request without a customer record (nothing
 * stored under the e-mail) is completed with a note.
 */
export async function eraseForRequest(container: MedusaContainer, requestId: string, actor: Actor) {
  const { request } = await getRequest(container, requestId)
  if (!canDo(request.status as RequestStatus, "anonymize", request.type)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Accept the erasure request first; only accepted erasure requests can be carried out."
    )
  }
  const service = resolveCompliance(container)
  if (
    request.customer_id &&
    !(await service.listComplianceAnonymizations({ customer_id: request.customer_id })).length
  ) {
    const { result } = await anonymizeComplianceCustomerWorkflow(container).run({
      input: { customer_id: request.customer_id, request_id: requestId, actor_id: actor.id },
    })
    await addRequestEvent(container, requestId, "anonymized", actor, null, result.summary as Row)
  } else {
    await addRequestEvent(
      container,
      requestId,
      "noted",
      actor,
      request.customer_id ? "The customer was already anonymised." : "No customer record under this e-mail address."
    )
  }
  return actOnRequest(container, requestId, "complete", actor, null)
}

/** Daily: billing addresses kept for invoices are removed once their retention period ends. */
export async function purgeBillingData(container: MedusaContainer, now = new Date()) {
  const service = resolveCompliance(container)
  const settings = await service.getSettings()
  const due = await service.listComplianceOrderRetentions(
    { purged_at: null, purge_after: { $lte: now } },
    { take: 500 }
  )
  if (!due.length) return 0
  const { data: orders } = await graph(container)({
    entity: "order",
    fields: ["id", "billing_address.id"],
    filters: { id: due.map((d) => d.order_id) },
  })
  const addressIds = orders.map((o: Row) => o.billing_address?.id).filter(Boolean) as string[]
  const orderModule = container.resolve(Modules.ORDER) as unknown as {
    updateOrderAddresses: (data: Row[]) => Promise<Row[]>
  }
  if (addressIds.length) {
    await orderModule.updateOrderAddresses(
      addressIds.map((id) => ({ id, ...anonymizedAddress(settings.gdpr.anonymize.placeholder) }))
    )
  }
  await service.updateComplianceOrderRetentions(due.map((d) => ({ id: d.id, purged_at: now })))
  logger(container).info(`[compliance] Removed billing data of ${due.length} orders after the retention period`)
  return due.length
}
