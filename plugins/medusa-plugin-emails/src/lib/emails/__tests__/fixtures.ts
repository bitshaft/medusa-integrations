import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { EMAILS_MODULE } from "../../../modules/emails"
import type { ClaimMessageInput, MessageRecord } from "../../../modules/emails/service"
import type { RawOrder } from "../data/order"
import { type EmailsPluginOptionsInput, parseOptions } from "../options"
import { mergeSettings, type SettingRow } from "../settings"

export const BASE_OPTIONS: EmailsPluginOptionsInput = {
  from: "Test Shop <orders@shop.test>",
  replyTo: "help@shop.test",
  storefrontUrl: "https://shop.test",
  adminUrl: "https://api.shop.test/app",
  team: { recipients: ["team@shop.test"] },
}

export function rawOrder(extra: Partial<RawOrder> = {}): RawOrder {
  return {
    id: "order_1",
    display_id: 1042,
    created_at: "2026-11-10T09:30:00.000Z",
    email: "anna@example.com",
    currency_code: "pln",
    locale: null,
    metadata: null,
    customer_id: "cus_1",
    total: 262.99,
    tax_total: 49.18,
    discount_total: 0,
    item_total: 248,
    original_item_total: 248,
    shipping_total: 14.99,
    original_shipping_total: 14.99,
    items: [
      {
        id: "item_1",
        title: "Bluza z kapturem",
        product_title: "Bluza z kapturem",
        variant_title: "M / Grafitowy",
        variant_sku: "HOOD-M-GR",
        quantity: 1,
        unit_price: 189,
        total: 189,
      },
      {
        id: "item_2",
        title: "Skarpety",
        product_title: "Skarpety",
        variant_title: "Default variant",
        quantity: { value: "2" },
        unit_price: 29.5,
        total: "59",
      },
    ],
    shipping_address: {
      first_name: "Anna",
      last_name: "Nowak",
      address_1: "ul. Lipowa 12/4",
      postal_code: "00-001",
      city: "Warszawa",
      country_code: "pl",
      phone: "+48 600 100 200",
    },
    billing_address: null,
    shipping_methods: [{ name: "Paczkomat InPost" }],
    customer: { id: "cus_1", first_name: "Anna", last_name: "Nowak", metadata: null },
    ...extra,
  }
}

type GraphArgs = { entity: string; filters?: Record<string, unknown>; fields?: string[] }

export type TestContainerConfig = {
  options?: EmailsPluginOptionsInput | Record<string, unknown>
  /** Rows of `emails_setting`. */
  settings?: SettingRow[]
  /** Records `query.graph` returns, by entity. Defaults to one order. */
  graph?: Record<string, unknown[]> | ((args: GraphArgs) => unknown[])
  /** Behaviour of the notification module; resolves with an ID by default. */
  createNotifications?: jest.Mock
  storeName?: string | null
}

/**
 * A container with just enough of Medusa for the send pipeline: an
 * in-memory emails module (real options parsing and settings merging), the
 * query, the notification module, the logger and the event bus.
 */
export function createTestContainer(config: TestContainerConfig = {}) {
  const parsed = parseOptions(config.options ?? BASE_OPTIONS)
  const messages: MessageRecord[] = []
  const settingRows = [...(config.settings ?? [])]
  let sequence = 0

  const emails = {
    isEnabled: async () => parsed.enabled,
    getDisabledReason: async () => (parsed.enabled ? null : parsed.reason),
    getOptions: async () => {
      if (!parsed.enabled) {
        throw new Error(`The emails plugin is disabled: ${parsed.reason}`)
      }
      return parsed.options
    },
    getSettings: async () => {
      if (!parsed.enabled) {
        throw new Error("disabled")
      }
      return mergeSettings(parsed.options, settingRows)
    },
    claimMessage: jest.fn(async (input: ClaimMessageInput) => {
      const existing = input.dedupe_key ? messages.find((message) => message.dedupe_key === input.dedupe_key) : null
      if (existing) {
        return { message: existing, duplicate: true }
      }
      const message: MessageRecord = {
        id: `emsg_${++sequence}`,
        subject: null,
        status: "pending",
        dedupe_key: null,
        order_id: null,
        customer_id: null,
        resource_type: null,
        resource_id: null,
        trigger_type: null,
        input: null,
        attempts: 0,
        retryable: false,
        next_retry_at: null,
        error: null,
        notification_id: null,
        original_message_id: null,
        sent_at: null,
        created_at: new Date(),
        ...input,
      }
      messages.push(message)
      return { message: { ...message }, duplicate: false }
    }),
    updateEmailsMessages: jest.fn(async (update: Partial<MessageRecord> & { id: string }) => {
      const message = messages.find((entry) => entry.id === update.id)
      if (!message) {
        throw new Error(`Message ${update.id} not found`)
      }
      Object.assign(message, update)
      return message
    }),
    retrieveEmailsMessage: jest.fn(async (id: string) => {
      const message = messages.find((entry) => entry.id === id)
      if (!message) {
        throw new Error(`Message ${id} not found`)
      }
      return { ...message }
    }),
    listEmailsMessages: jest.fn(async (filters: { id?: string }) =>
      messages.filter((message) => !filters.id || message.id === filters.id).map((message) => ({ ...message }))
    ),
  }

  const graphCalls: GraphArgs[] = []
  const graphSource = config.graph ?? { order: [rawOrder()] }
  const query = {
    graph: jest.fn(async (args: GraphArgs) => {
      graphCalls.push(args)
      const records = typeof graphSource === "function" ? graphSource(args) : (graphSource[args.entity] ?? [])
      const id = args.filters?.id
      return {
        data: typeof id === "string" ? records.filter((record) => (record as { id?: string }).id === id) : records,
      }
    }),
  }

  let notificationSequence = 0
  const createNotifications =
    config.createNotifications ?? jest.fn(async () => ({ id: `noti_${++notificationSequence}` }))
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  const eventBus = { emit: jest.fn(async () => undefined) }
  const store = {
    listStores: jest.fn(async () => (config.storeName === null ? [] : [{ name: config.storeName ?? "Medusa Store" }])),
  }

  const registrations: Record<string, unknown> = {
    [EMAILS_MODULE]: emails,
    [ContainerRegistrationKeys.LOGGER]: logger,
    [ContainerRegistrationKeys.QUERY]: query,
    [Modules.NOTIFICATION]: { createNotifications },
    [Modules.EVENT_BUS]: eventBus,
    [Modules.STORE]: store,
  }
  const container = {
    resolve: (key: string) => {
      if (!(key in registrations)) {
        throw new Error(`Nothing registered as "${key}" in the test container`)
      }
      return registrations[key]
    },
  } as unknown as MedusaContainer

  return { container, emails, messages, query, graphCalls, createNotifications, logger, eventBus, settingRows }
}
