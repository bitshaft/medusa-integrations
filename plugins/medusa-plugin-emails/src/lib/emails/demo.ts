import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"

import type EmailsModuleService from "../../modules/emails/service"
import { buildDemoMessages, type DemoCustomer, type DemoOrder } from "./demo-data"
import { createFormatters, toNumber } from "./format"
import type { EmailLocale } from "./locales"
import type { EmailsPluginOptions } from "./options"
import { loadStoreName } from "./send"
import { teamRecipients } from "./settings"

type Row = Record<string, any>

/** Sample orders for a store that has none yet; their emails cannot be resent. */
const SAMPLE_ORDERS: Array<Omit<DemoOrder, "locale" | "total"> & { amount: number }> = [
  {
    id: "order_demo_1",
    display_id: 1001,
    email: "anna.nowak@example.com",
    customer_id: null,
    amount: 249,
    real: false,
  },
  {
    id: "order_demo_2",
    display_id: 1002,
    email: "piotr.zielinski@example.com",
    customer_id: null,
    amount: 89.9,
    real: false,
  },
  {
    id: "order_demo_3",
    display_id: 1003,
    email: "marta.kowalczyk@example.com",
    customer_id: null,
    amount: 412.5,
    real: false,
  },
  {
    id: "order_demo_4",
    display_id: 1004,
    email: "jan.kowalski@example.com",
    customer_id: null,
    amount: 59,
    real: false,
  },
  {
    id: "order_demo_5",
    display_id: 1005,
    email: "ewa.malinowska@example.com",
    customer_id: null,
    amount: 1299,
    real: false,
  },
  {
    id: "order_demo_6",
    display_id: 1006,
    email: "tomasz.wrobel@example.com",
    customer_id: null,
    amount: 175,
    real: false,
  },
]

/**
 * "Restore test data" (demo mode only): replaces the demo rows of the send
 * log with a month of history over the store's latest orders and
 * customers. Sends nothing.
 */
export async function resetEmailsDemo(
  container: MedusaContainer,
  emails: EmailsModuleService,
  options: EmailsPluginOptions,
  now = new Date()
): Promise<{ messages: number; orders: number; customers: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const settings = await emails.getSettings()
  const localeOf = (country: unknown): EmailLocale =>
    (typeof country === "string" && options.localeByCountry[country.toLowerCase()]) || options.defaultLocale

  const read = async (entity: string, fields: string[], take: number): Promise<Row[]> => {
    try {
      const { data } = await query.graph({ entity, fields, pagination: { take, order: { created_at: "DESC" } } })
      return data as Row[]
    } catch {
      return []
    }
  }
  const realOrders = (
    await read(
      "order",
      ["id", "display_id", "email", "customer_id", "total", "currency_code", "shipping_address.country_code"],
      12
    )
  ).filter((o) => o?.email)
  const orders: DemoOrder[] = realOrders.length
    ? realOrders.reverse().map((o) => {
        const locale = localeOf(o.shipping_address?.country_code)
        return {
          id: o.id,
          display_id: o.display_id ?? null,
          email: o.email,
          customer_id: o.customer_id ?? null,
          total: createFormatters(locale).money(toNumber(o.total), o.currency_code),
          locale,
          real: true,
        }
      })
    : SAMPLE_ORDERS.map(({ amount, ...o }) => ({
        ...o,
        locale: options.defaultLocale,
        total: createFormatters(options.defaultLocale).money(amount, "pln"),
      }))

  const customers: DemoCustomer[] = (await read("customer", ["id", "email", "has_account"], 20))
    .filter((c) => c?.email && c.has_account)
    .slice(0, 6)
    .map((c) => ({ id: c.id, email: c.email, locale: options.defaultLocale }))

  const messages = buildDemoMessages({
    now,
    orders,
    customers,
    team: teamRecipients(settings, "team-new-order"),
    storeName: options.brand.name ?? (await loadStoreName(container)) ?? "Shop",
    defaultLocale: options.defaultLocale,
    id: (prefix) => generateEntityId(undefined, prefix),
  })
  await emails.replaceDemoMessages(messages)
  return { messages: messages.length, orders: orders.length, customers: customers.length }
}
