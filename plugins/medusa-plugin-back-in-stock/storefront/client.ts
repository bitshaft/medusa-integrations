import {
  type BackInStockStoreConfig,
  type BackInStockSubscription,
  BackInStockError,
  type Consent,
  type SubscribeParams,
  type SubscribeResult,
  type TokenOutcome,
} from "./types"

/** `POST /store/back-in-stock/subscriptions`. The customer must have accepted the consent text. */
export async function subscribe(config: BackInStockStoreConfig, params: SubscribeParams): Promise<SubscribeResult> {
  return (await request(config, "POST", "/store/back-in-stock/subscriptions", {
    body: {
      variant_id: params.variantId,
      ...(params.email ? { email: params.email } : {}),
      ...(params.salesChannelId ? { sales_channel_id: params.salesChannelId } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
      ...(params.countryCode ? { country_code: params.countryCode.toLowerCase() } : {}),
      consent: true,
    },
  })) as SubscribeResult
}

/** `GET /store/back-in-stock/consent`: the text to show next to the form. */
export async function getConsent(config: BackInStockStoreConfig, locale?: string): Promise<Consent> {
  return (await request(config, "GET", "/store/back-in-stock/consent", {
    query: locale ? { locale } : {},
  })) as Consent
}

/** `GET /store/back-in-stock/subscriptions`: the logged-in customer's alerts (needs the SDK fetcher). */
export async function listMySubscriptions(config: BackInStockStoreConfig): Promise<BackInStockSubscription[]> {
  const response = (await request(config, "GET", "/store/back-in-stock/subscriptions")) as {
    subscriptions: BackInStockSubscription[]
  }
  return response.subscriptions ?? []
}

/** `POST /store/back-in-stock/subscriptions/:id/unsubscribe` for a logged-in customer. */
export async function unsubscribeMine(config: BackInStockStoreConfig, id: string): Promise<void> {
  await request(config, "POST", `/store/back-in-stock/subscriptions/${encodeURIComponent(id)}/unsubscribe`, {
    body: {},
  })
}

/**
 * `POST /store/back-in-stock/confirm` or `/unsubscribe` with the token from
 * the link. Call it from a button on your page, never on page load: mail
 * scanners open links too.
 */
export async function applyToken(
  config: BackInStockStoreConfig,
  action: "confirm" | "unsubscribe",
  token: string
): Promise<TokenOutcome> {
  try {
    return (await request(config, "POST", `/store/back-in-stock/${action}`, { body: { token } })) as TokenOutcome
  } catch (error) {
    if (error instanceof BackInStockError && error.status === 404) {
      return { outcome: "invalid", subscription: null }
    }
    throw error
  }
}

async function request(
  config: BackInStockStoreConfig,
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown; query?: Record<string, string> } = {}
): Promise<unknown> {
  if (config.fetcher) {
    try {
      return await config.fetcher(path, { method, ...init })
    } catch (error) {
      const failure = error as { status?: number; message?: string; code?: string }
      throw new BackInStockError(failure.message ?? "Request failed", failure.status ?? 500, failure.code ?? null)
    }
  }
  const query = init.query && Object.keys(init.query).length ? `?${new URLSearchParams(init.query).toString()}` : ""
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}${path}${query}`, {
    method,
    headers: {
      "x-publishable-api-key": config.publishableKey,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: "include",
  })
  const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string }
  if (!response.ok) {
    throw new BackInStockError(
      payload.message ?? `Request failed (HTTP ${response.status})`,
      response.status,
      payload.code ?? null
    )
  }
  return payload
}
