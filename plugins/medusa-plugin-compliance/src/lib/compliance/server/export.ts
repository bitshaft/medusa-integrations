import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { type CsvCell, toCsv } from "../csv"
import { normalizeEmail } from "../requests"
import { zip } from "../zip"
import { subjectEntries } from "./consents"
import { graph, logger, resolveCompliance } from "./runtime"

type Row = Record<string, any>

const ADDRESS = [
  "first_name",
  "last_name",
  "company",
  "address_1",
  "address_2",
  "city",
  "postal_code",
  "province",
  "country_code",
  "phone",
]

const ORDER_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "status",
  "email",
  "currency_code",
  "total",
  "items.title",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  ...ADDRESS.map((f) => `shipping_address.${f}`),
  ...ADDRESS.map((f) => `billing_address.${f}`),
]

export type CustomerExport = {
  generated_at: string
  subject: { customer_id: string | null; email: string | null }
  profile: Row | null
  addresses: Row[]
  orders: Row[]
  consents: Row[]
  requests: Row[]
  /** Data from other plugins, by section name. */
  providers: Record<string, unknown>
}

/**
 * Everything the store keeps about a person: profile, addresses, orders,
 * consents, their requests and the data of registered providers (other
 * plugins). Works for guests too, by e-mail.
 */
export async function collectCustomerData(
  container: MedusaContainer,
  subject: { customer_id?: string | null; email?: string | null }
): Promise<CustomerExport> {
  const query = graph(container)
  let profile: Row | null = null
  let addresses: Row[] = []
  let email = subject.email ? normalizeEmail(subject.email) : null
  if (subject.customer_id) {
    const { data } = await query({
      entity: "customer",
      fields: [
        "id",
        "email",
        "first_name",
        "last_name",
        "company_name",
        "phone",
        "has_account",
        "created_at",
        "metadata",
        ...ADDRESS.map((f) => `addresses.${f}`),
        "addresses.address_name",
      ],
      filters: { id: subject.customer_id },
    })
    if (data[0]) {
      const { addresses: list, ...rest } = data[0]
      profile = rest
      addresses = (list ?? []).filter(Boolean)
      email = email ?? (rest.email ? normalizeEmail(rest.email) : null)
    }
  }

  const orderFilters = subject.customer_id ? { customer_id: subject.customer_id } : email ? { email } : null
  const orders = orderFilters
    ? (await query({ entity: "order", fields: ORDER_FIELDS, filters: orderFilters })).data
    : []

  const consents = (await subjectEntries(container, { customer_id: subject.customer_id, email })).map((e) => ({
    type_key: e.type_key,
    version: e.version,
    granted: e.granted,
    source: e.source,
    placement: e.placement,
    created_at: e.created_at.toISOString(),
  }))

  const service = resolveCompliance(container)
  const or: Row[] = []
  if (subject.customer_id) or.push({ customer_id: subject.customer_id })
  if (email) or.push({ email })
  const requests = or.length
    ? (await service.listComplianceRequests({ $or: or })).map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        created_at: r.created_at,
        verified_at: r.verified_at,
        closed_at: r.closed_at,
      }))
    : []

  const providers: Record<string, unknown> = {}
  for (const provider of (await service.getOptions()).dataProviders) {
    const label = provider.label ?? provider.module
    try {
      const target = container.resolve(provider.module) as Record<string, unknown>
      const method = target?.[provider.method]
      if (typeof method !== "function")
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `${provider.module}.${provider.method} is not a function`)
      providers[label] = await (method as (id: string | null, email: string | null) => Promise<unknown>).call(
        target,
        subject.customer_id ?? null,
        email
      )
    } catch (error) {
      logger(container).warn(`[compliance] Data provider ${label} failed: ${(error as Error).message}`)
      providers[label] = { error: "This provider failed; its data is not in the export." }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    subject: { customer_id: subject.customer_id ?? null, email },
    profile,
    addresses,
    orders,
    consents,
    requests,
    providers,
  }
}

/** One CSV per section; nested values are written as JSON. */
export function exportCsvFiles(data: CustomerExport): Array<{ name: string; content: string }> {
  const table = (rows: Row[]) => {
    const header = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    return toCsv(
      header,
      rows.map((r) =>
        header.map((h) => {
          const value = r[h]
          return (value !== null && typeof value === "object" ? JSON.stringify(value) : value) as CsvCell
        })
      )
    )
  }
  const files = [
    { name: "profile.csv", content: table(data.profile ? [data.profile] : []) },
    { name: "addresses.csv", content: table(data.addresses) },
    {
      name: "orders.csv",
      content: table(
        data.orders.map(({ items, shipping_address, billing_address, ...order }) => ({
          ...order,
          items: (items ?? [])
            .filter(Boolean)
            .map((i: Row) => `${i.quantity} × ${i.title}`)
            .join(", "),
          shipping_address,
          billing_address,
        }))
      ),
    },
    { name: "consents.csv", content: table(data.consents) },
    { name: "requests.csv", content: table(data.requests) },
  ]
  for (const [name, value] of Object.entries(data.providers)) {
    const rows = Array.isArray(value) ? value : [value]
    files.push({
      name: `providers/${name.replace(/[^\w.-]+/g, "_")}.csv`,
      content: table(rows.filter((r) => r && typeof r === "object") as Row[]),
    })
  }
  return files
}

/** The export package: data.json plus the CSV files, in one ZIP. */
export function exportZip(data: CustomerExport): Buffer {
  return zip([{ name: "data.json", content: JSON.stringify(data, null, 2) }, ...exportCsvFiles(data)])
}
