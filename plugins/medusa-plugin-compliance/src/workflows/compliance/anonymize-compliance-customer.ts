import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"

import {
  ADDRESS_PERSONAL_FIELDS,
  anonymizedAddress,
  anonymousEmail,
  customerUpdate,
  orderPlan,
  scopeSummary,
} from "../../lib/compliance/anonymize"
import type { ComplianceSettings } from "../../lib/compliance/settings"
import { ComplianceEvents, resolveCompliance } from "../../lib/compliance/server/runtime"

type Row = Record<string, any>
type Scope = ComplianceSettings["gdpr"]["anonymize"]

export type AnonymizeCustomerInput = {
  customer_id: string
  request_id?: string | null
  actor_id?: string | null
}

const ADDRESS_FIELDS = [...ADDRESS_PERSONAL_FIELDS, "metadata"]
const pick = (row: Row | null | undefined, fields: readonly string[]) =>
  Object.fromEntries(fields.map((f) => [f, row?.[f] ?? null]))

async function query(container: MedusaContainer, config: Row): Promise<Row[]> {
  const q = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (config: Row) => Promise<{ data: Row[] }>
  }
  return (await q.graph(config)).data
}

/** Everything the anonymisation touches, read before anything changes. */
export const complianceLoadSubjectStep = createStep(
  "compliance-load-subject",
  async (input: AnonymizeCustomerInput, { container }) => {
    const settings = await resolveCompliance(container).getSettings()
    const [customer] = await query(container, {
      entity: "customer",
      fields: [
        "id",
        "email",
        "first_name",
        "last_name",
        "phone",
        "company_name",
        "has_account",
        "metadata",
        "addresses.*",
      ],
      filters: { id: input.customer_id },
    })
    if (!customer) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Customer ${input.customer_id} was not found.`)
    const orders = await query(container, {
      entity: "order",
      fields: ["id", "created_at", "email", "shipping_address.*", "billing_address.*"],
      filters: { customer_id: input.customer_id },
    })
    const cart = container.resolve(Modules.CART) as unknown as {
      listCarts: (filters: Row, config?: Row) => Promise<Row[]>
    }
    const carts = settings.gdpr.anonymize.carts
      ? await cart.listCarts(
          { customer_id: input.customer_id, completed_at: null },
          { relations: ["shipping_address", "billing_address"] }
        )
      : []
    return new StepResponse({ customer, orders, carts, scope: settings.gdpr.anonymize as Scope })
  }
)

export const complianceAnonymizeCustomerStep = createStep(
  "compliance-anonymize-customer",
  async (input: { customer: Row; scope: Scope }, { container }) => {
    const customers = container.resolve(Modules.CUSTOMER) as unknown as {
      updateCustomers: (id: string, data: Row) => Promise<Row>
      deleteCustomerAddresses: (ids: string[]) => Promise<void>
    }
    const { customer, scope } = input
    const addresses = (customer.addresses ?? []).filter(Boolean) as Row[]
    await customers.updateCustomers(customer.id, customerUpdate(customer.id, scope))
    if (addresses.length) await customers.deleteCustomerAddresses(addresses.map((a) => a.id))
    return new StepResponse(
      { email: anonymousEmail(customer.id), removed_addresses: addresses.length },
      {
        id: customer.id,
        previous: pick(customer, [
          "email",
          "first_name",
          "last_name",
          "phone",
          "company_name",
          "has_account",
          "metadata",
        ]),
        addresses,
      }
    )
  },
  async (saved, { container }) => {
    if (!saved) return
    const customers = container.resolve(Modules.CUSTOMER) as unknown as {
      updateCustomers: (id: string, data: Row) => Promise<Row>
      createCustomerAddresses: (data: Row[]) => Promise<Row[]>
    }
    await customers.updateCustomers(saved.id, saved.previous)
    if (saved.addresses.length) {
      await customers.createCustomerAddresses(
        saved.addresses.map(({ id: _id, created_at: _c, updated_at: _u, deleted_at: _d, ...a }) => ({
          ...a,
          customer_id: saved.id,
        }))
      )
    }
  }
)

export const complianceAnonymizeOrdersStep = createStep(
  "compliance-anonymize-orders",
  async (input: { customer_id: string; orders: Row[]; scope: Scope }, { container }) => {
    const orderModule = container.resolve(Modules.ORDER) as unknown as {
      updateOrders: (data: Row[]) => Promise<Row[]>
      updateOrderAddresses: (data: Row[]) => Promise<Row[]>
    }
    const now = new Date()
    const email = anonymousEmail(input.customer_id)
    const orderUpdates: Row[] = []
    const addressUpdates: Row[] = []
    const previousOrders: Row[] = []
    const previousAddresses: Row[] = []
    const retention: Array<{ order_id: string; purge_after: Date }> = []

    for (const order of input.orders) {
      const plan = orderPlan(new Date(order.created_at), input.scope, now)
      if (plan.email && order.email) {
        orderUpdates.push({ id: order.id, email })
        previousOrders.push({ id: order.id, email: order.email })
      }
      const handle = (address: Row | null | undefined, full: boolean) => {
        if (!address?.id) return
        if (full) {
          addressUpdates.push({ id: address.id, ...anonymizedAddress(input.scope.placeholder) })
          previousAddresses.push({ id: address.id, ...pick(address, ADDRESS_FIELDS) })
        } else if (plan.phone && address.phone) {
          addressUpdates.push({ id: address.id, phone: null })
          previousAddresses.push({ id: address.id, phone: address.phone })
        }
      }
      handle(order.shipping_address, plan.shipping)
      if (order.billing_address?.id !== order.shipping_address?.id) handle(order.billing_address, plan.billing)
      if (plan.billing_purge_after && order.billing_address?.id) {
        retention.push({ order_id: order.id, purge_after: plan.billing_purge_after })
      }
    }
    if (orderUpdates.length) await orderModule.updateOrders(orderUpdates)
    if (addressUpdates.length) await orderModule.updateOrderAddresses(addressUpdates)
    return new StepResponse(
      { orders: input.orders.length, addresses: addressUpdates.length, retention },
      { previousOrders, previousAddresses }
    )
  },
  async (saved, { container }) => {
    if (!saved) return
    const orderModule = container.resolve(Modules.ORDER) as unknown as {
      updateOrders: (data: Row[]) => Promise<Row[]>
      updateOrderAddresses: (data: Row[]) => Promise<Row[]>
    }
    if (saved.previousOrders.length) await orderModule.updateOrders(saved.previousOrders)
    if (saved.previousAddresses.length) await orderModule.updateOrderAddresses(saved.previousAddresses)
  }
)

export const complianceAnonymizeCartsStep = createStep(
  "compliance-anonymize-carts",
  async (input: { customer_id: string; carts: Row[]; scope: Scope }, { container }) => {
    if (!input.carts.length) return new StepResponse({ carts: 0 }, null)
    const cart = container.resolve(Modules.CART) as unknown as {
      updateCarts: (data: Row[]) => Promise<Row[]>
      updateAddresses: (data: Row[]) => Promise<Row[]>
    }
    const email = anonymousEmail(input.customer_id)
    const addresses = input.carts
      .flatMap((c) => [c.shipping_address, c.billing_address])
      .filter((a, i, all) => a?.id && all.findIndex((b) => b?.id === a.id) === i) as Row[]
    await cart.updateCarts(input.carts.map((c) => ({ id: c.id, email })))
    if (addresses.length) {
      await cart.updateAddresses(addresses.map((a) => ({ id: a.id, ...anonymizedAddress(input.scope.placeholder) })))
    }
    return new StepResponse(
      { carts: input.carts.length },
      {
        carts: input.carts.map((c) => ({ id: c.id, email: c.email ?? null })),
        addresses: addresses.map((a) => ({ id: a.id, ...pick(a, ADDRESS_FIELDS) })),
      }
    )
  },
  async (saved, { container }) => {
    if (!saved) return
    const cart = container.resolve(Modules.CART) as unknown as {
      updateCarts: (data: Row[]) => Promise<Row[]>
      updateAddresses: (data: Row[]) => Promise<Row[]>
    }
    await cart.updateCarts(saved.carts)
    if (saved.addresses.length) await cart.updateAddresses(saved.addresses)
  }
)

/**
 * Removes the customer's login. An identity shared with an admin user keeps
 * its other link and only loses the customer. Cannot be undone, so it runs
 * after every step that can.
 */
export const complianceRemoveLoginStep = createStep(
  "compliance-remove-login",
  async (input: { customer_id: string }, { container }) => {
    const identities = await query(container, {
      entity: "auth_identity",
      fields: ["id", "app_metadata"],
      filters: { app_metadata: { customer_id: input.customer_id } },
    })
    const auth = container.resolve(Modules.AUTH) as unknown as {
      deleteAuthIdentities: (ids: string[]) => Promise<void>
      updateAuthIdentities: (data: Row[]) => Promise<Row[]>
    }
    const keep = identities.filter((i) => Object.keys(i.app_metadata ?? {}).some((k) => k !== "customer_id"))
    const remove = identities.filter((i) => !keep.includes(i))
    if (keep.length) {
      await auth.updateAuthIdentities(
        keep.map((i) => {
          const { customer_id: _removed, ...rest } = i.app_metadata ?? {}
          return { id: i.id, app_metadata: rest }
        })
      )
    }
    if (remove.length) await auth.deleteAuthIdentities(remove.map((i) => i.id))
    return new StepResponse({ removed: remove.length, detached: keep.length })
  }
)

/** Remembers the anonymisation, so sessions and tokens of the customer are refused from now on. */
export const complianceRecordAnonymizationStep = createStep(
  "compliance-record-anonymization",
  async (
    input: {
      customer_id: string
      request_id: string | null
      actor_id: string | null
      summary: Row
      retention: Array<{ order_id: string; purge_after: Date }>
    },
    { container }
  ) => {
    const service = resolveCompliance(container)
    const [record] = (await service.createComplianceAnonymizations([
      {
        customer_id: input.customer_id,
        request_id: input.request_id,
        actor_id: input.actor_id,
        summary: input.summary,
      },
    ] as never)) as unknown as Row[]
    if (input.retention.length) {
      await service.createComplianceOrderRetentions(
        input.retention.map((r) => ({ ...r, customer_id: input.customer_id })) as never
      )
    }
    await service.markAnonymized(input.customer_id)
    return new StepResponse(record, (record as Row).id)
  },
  async (id, { container }) => {
    if (id) await resolveCompliance(container).deleteComplianceAnonymizations(id)
  }
)

export const anonymizeComplianceCustomerWorkflowId = "anonymize-compliance-customer"

/**
 * Anonymises a customer after an accepted erasure request: personal data of
 * the customer, addresses, orders (within the scope in the settings) and
 * open carts; removes the login; emits `compliance.customer_anonymized` so
 * other plugins remove their data too. Every step is undone on failure.
 */
export const anonymizeComplianceCustomerWorkflow = createWorkflow(
  anonymizeComplianceCustomerWorkflowId,
  (input: AnonymizeCustomerInput) => {
    const subject = complianceLoadSubjectStep(input)
    const customerInput = transform({ subject }, ({ subject }) => ({
      customer: subject.customer,
      scope: subject.scope,
    }))
    const customer = complianceAnonymizeCustomerStep(customerInput)
    const ordersInput = transform({ subject, input }, ({ subject, input }) => ({
      customer_id: input.customer_id,
      orders: subject.orders,
      scope: subject.scope,
    }))
    const orders = complianceAnonymizeOrdersStep(ordersInput)
    const cartsInput = transform({ subject, input }, ({ subject, input }) => ({
      customer_id: input.customer_id,
      carts: subject.carts,
      scope: subject.scope,
    }))
    const carts = complianceAnonymizeCartsStep(cartsInput)
    const recordInput = transform({ input, customer, orders, carts, subject }, (data) => ({
      customer_id: data.input.customer_id,
      request_id: data.input.request_id ?? null,
      actor_id: data.input.actor_id ?? null,
      summary: {
        removed_addresses: data.customer.removed_addresses,
        orders: data.orders.orders,
        order_addresses: data.orders.addresses,
        billing_kept_until: data.orders.retention.map((r) => ({ order_id: r.order_id, until: r.purge_after })),
        carts: data.carts.carts,
        kept: scopeSummary(data.subject.scope),
      },
      retention: data.orders.retention,
    }))
    const record = complianceRecordAnonymizationStep(recordInput)
    const login = complianceRemoveLoginStep(transform({ input }, ({ input }) => ({ customer_id: input.customer_id })))
    const eventData = transform({ input }, ({ input }) => ({
      eventName: ComplianceEvents.CUSTOMER_ANONYMIZED,
      data: { customer_id: input.customer_id, request_id: input.request_id ?? null },
    }))
    emitEventStep(eventData)
    return new WorkflowResponse(
      transform({ record, login, recordInput }, ({ record, login, recordInput }) => ({
        id: (record as Row).id as string,
        summary: recordInput.summary,
        login,
      }))
    )
  }
)
