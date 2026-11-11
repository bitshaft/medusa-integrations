import type { VariantAvailability } from "../availability"
import type { DeliveryInput, DeliveryResult } from "../deliver"
import type { EngineDependencies, EngineStore } from "../engine"
import type { ProductInfo } from "../links"
import { type BackInStockPluginOptionsInput, pluginOptionsSchema } from "../options"
import { mergeSettings } from "../settings"
import type { NotificationRecord, Pair, PendingCheckRecord, SubscriptionRecord, VariantStateRecord } from "../types"

export const VARIANT = "variant_1"
export const CHANNEL = "sc_1"
export const PAIR: Pair = { variant_id: VARIANT, sales_channel_id: CHANNEL }

export const PRODUCT: ProductInfo = {
  variant_id: VARIANT,
  variant_title: "M",
  sku: "HOOD-M",
  product_id: "prod_1",
  product_title: "Hoodie",
  handle: "hoodie",
  thumbnail: "https://cdn.shop.test/hoodie.png",
}

/**
 * An in-memory EngineStore with the same rules as the module service:
 * conditional claims, one open check per pair, one pending email per
 * subscription.
 */
export class MemoryStore implements EngineStore {
  checks = new Map<string, PendingCheckRecord>()
  states = new Map<string, VariantStateRecord>()
  subscriptions: SubscriptionRecord[] = []
  notifications: NotificationRecord[] = []
  tokens: Array<{ subscription_id: string; purpose: string; token: string }> = []
  private sequence = 0

  addSubscription(extra: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
    const subscription: SubscriptionRecord = {
      id: `bisub_${++this.sequence}`,
      email: `person${this.sequence}@example.com`,
      variant_id: VARIANT,
      product_id: "prod_1",
      sales_channel_id: CHANNEL,
      customer_id: null,
      locale: "pl",
      country_code: "pl",
      status: "active",
      consent_text: null,
      confirmed_at: new Date(0),
      notification_count: 0,
      last_notified_at: null,
      ended_at: null,
      anonymized_at: null,
      demo: false,
      created_at: new Date(this.sequence * 1000),
      ...extra,
    }
    this.subscriptions.push(subscription)
    return subscription
  }

  async getCheck(id: string) {
    const check = this.checks.get(id)
    return check ? { ...check } : null
  }

  async claimCheck(id: string, now: Date, staleBefore: Date) {
    const check = this.checks.get(id)
    if (!check || (check.claimed_at && check.claimed_at >= staleBefore)) {
      return null
    }
    check.claimed_at = now
    return { ...check }
  }

  async finishCheck(check: PendingCheckRecord, nextDueAt: Date) {
    const current = this.checks.get(check.id)
    if (current?.dirty_at && check.claimed_at && current.dirty_at > check.claimed_at) {
      Object.assign(current, { claimed_at: null, dirty_at: null, forced: false, due_at: nextDueAt })
      return { ...current }
    }
    this.checks.delete(check.id)
    return null
  }

  async upsertCheck(pair: Pair, now: Date, dueAt: Date, forced: boolean) {
    const existing = [...this.checks.values()].find(
      (check) => check.variant_id === pair.variant_id && check.sales_channel_id === pair.sales_channel_id
    )
    if (existing) {
      if (existing.claimed_at) {
        existing.dirty_at = now
      }
      if (forced) {
        existing.forced = true
      }
      return { check: { ...existing }, created: false }
    }
    const check: PendingCheckRecord = {
      id: `bichk_${++this.sequence}`,
      ...pair,
      due_at: dueAt,
      claimed_at: null,
      dirty_at: null,
      forced,
    }
    this.checks.set(check.id, check)
    return { check: { ...check }, created: true }
  }

  async getState(pair: Pair) {
    return this.states.get(`${pair.variant_id}|${pair.sales_channel_id}`) ?? null
  }

  async saveState(state: VariantStateRecord) {
    this.states.set(`${state.variant_id}|${state.sales_channel_id}`, { ...state })
  }

  async listNotifiable(pair: Pair, rules: { notifiedBefore: Date | null; max: number; demoOnly: boolean }) {
    return this.subscriptions
      .filter(
        (row) =>
          row.variant_id === pair.variant_id &&
          row.sales_channel_id === pair.sales_channel_id &&
          row.status === "active" &&
          row.email !== null &&
          row.notification_count < rules.max &&
          (!rules.demoOnly || row.demo) &&
          (!rules.notifiedBefore || !row.last_notified_at || row.last_notified_at < rules.notifiedBefore)
      )
      .map((row) => ({ ...row }))
  }

  async claimNotification(subscription: SubscriptionRecord, kind: "restock" | "confirm", available: number | null) {
    if (this.notifications.some((row) => row.subscription_id === subscription.id && row.status === "pending")) {
      return null
    }
    const notification: NotificationRecord = {
      id: `binot_${++this.sequence}`,
      subscription_id: subscription.id,
      variant_id: subscription.variant_id,
      sales_channel_id: subscription.sales_channel_id,
      kind,
      status: "pending",
      via: null,
      available,
      error: null,
      sent_at: null,
      created_at: new Date(),
    }
    this.notifications.push(notification)
    return notification.id
  }

  async completeNotification(id: string, subscription: SubscriptionRecord, result: DeliveryResult, now: Date) {
    const row = this.notifications.find((notification) => notification.id === id)!
    const delivered = result.status === "sent" || result.status === "demo"
    Object.assign(row, {
      status: result.status,
      via: result.via,
      error: result.error ?? null,
      sent_at: delivered ? now : null,
    })
    if (delivered && row.kind === "restock") {
      const current = this.subscriptions.find((entry) => entry.id === subscription.id)!
      current.notification_count += 1
      current.last_notified_at = now
    }
  }

  async issueToken(subscriptionId: string, purpose: "confirm" | "unsubscribe") {
    const token = `token-${++this.sequence}`
    this.tokens.push({ subscription_id: subscriptionId, purpose, token })
    return token
  }
}

export type TestEngine = EngineDependencies & {
  store: MemoryStore
  deliveries: DeliveryInput[]
  emitted: Array<{ name: string; data: Record<string, unknown>; delayMs?: number }>
  setStock: (available: number | null, extra?: Partial<VariantAvailability>) => void
  advance: (ms: number) => void
}

export function createEngine(
  config: {
    options?: Partial<BackInStockPluginOptionsInput>
    deliver?: (input: DeliveryInput) => Promise<DeliveryResult>
  } = {}
): TestEngine {
  const store = new MemoryStore()
  const options = pluginOptionsSchema.parse({
    backendUrl: "https://api.shop.test",
    storefrontUrl: "https://shop.test",
    ...config.options,
  })
  let clock = Date.parse("2026-11-11T10:00:00.000Z")
  let stock: VariantAvailability = { variant_id: VARIANT, in_stock: false, available: 0, reason: "stock" }
  const deliveries: DeliveryInput[] = []
  const emitted: TestEngine["emitted"] = []

  return {
    store,
    options,
    deliveries,
    emitted,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
    now: () => new Date(clock),
    advance: (ms) => {
      clock += ms
    },
    setStock: (available, extra = {}) => {
      stock = {
        variant_id: VARIANT,
        in_stock: available !== null && available >= options.settings.minQuantity,
        available,
        reason: "stock",
        ...extra,
      }
    },
    settings: async () => mergeSettings(options, {}),
    availability: async (variantIds) => new Map(variantIds.map((id) => [id, { ...stock, variant_id: id }])),
    products: async (variantIds) => new Map(variantIds.map((id) => [id, { ...PRODUCT, variant_id: id }])),
    storeName: async () => "Test Shop",
    deliver: async (input) => {
      deliveries.push(input)
      return config.deliver ? config.deliver(input) : { status: "sent", via: "notification" }
    },
    emit: async (name, data, delayMs) => {
      emitted.push({ name, data, delayMs })
    },
  }
}
