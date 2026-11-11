/**
 * How the kit reaches the Store API: the backend URL and publishable key,
 * or your own fetcher (e.g. the Medusa JS SDK's `sdk.client.fetch`), which
 * then also carries the logged-in customer's session.
 */
export type BackInStockStoreConfig =
  | { baseUrl: string; publishableKey: string; fetcher?: never }
  | {
      fetcher: (
        path: string,
        init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> }
      ) => Promise<unknown>
      baseUrl?: never
      publishableKey?: never
    }

export type SubscribeParams = {
  variantId: string
  /** Optional for logged-in customers when you use the SDK fetcher. */
  email?: string
  /** Required when your publishable key is linked to several sales channels. */
  salesChannelId?: string
  /** `pl` or `en`; the backend falls back to its default language. */
  locale?: string
  /** Used for the product link in emails, e.g. `pl`. */
  countryCode?: string
}

export type BackInStockSubscription = {
  id: string
  variant_id: string
  product_id: string | null
  sales_channel_id: string
  status: "pending" | "active" | "purchased" | "unsubscribed" | "expired"
  notification_count: number
  last_notified_at: string | null
  created_at: string
}

export type SubscribeResult = {
  subscription: BackInStockSubscription
  created: boolean
  /** A confirmation email was sent (double opt-in is on). */
  confirmation_required: boolean
}

export type Consent = { locale: string; consent_text: string; double_opt_in: boolean }

export type TokenOutcome = { outcome: "done" | "already" | "invalid"; subscription: BackInStockSubscription | null }

/**
 * An error from the Store API. `code` is `variant_in_stock` when the
 * variant can be ordered now; `status` 429 means too many requests.
 */
export class BackInStockError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = "BackInStockError"
    this.status = status
    this.code = code
  }
}
