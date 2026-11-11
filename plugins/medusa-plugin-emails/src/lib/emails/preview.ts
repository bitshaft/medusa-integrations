import type { MedusaContainer } from "@medusajs/framework/types"

import { fetchOrder, fetchRecentOrders, toOrderView } from "./data/order"
import { sampleData, sampleOrder } from "./data/sample"
import type { EmailLocale } from "./locales"
import { buildUrl, type EmailsPluginOptions } from "./options"
import { getDefinition } from "./registry"
import type { LoadedEmail } from "./types"

export type PreviewSource = { id: string; display_id: string } | null

/**
 * Data for the admin preview and for test sends: a real order from the
 * store (the given one, else the newest), or a made-up order when the store
 * has none. Links and codes that would be secrets are placeholders.
 */
export async function buildPreview(
  container: MedusaContainer,
  options: EmailsPluginOptions,
  input: { type: string; locale: EmailLocale; orderId?: string | null }
): Promise<{ loaded: LoadedEmail; order: PreviewSource }> {
  const { type, locale } = input
  const custom = options.templates[type]?.previewData
  if (custom) {
    const data = typeof custom === "function" ? custom(locale) : custom
    return { loaded: { data, locale }, order: null }
  }

  const orderId = input.orderId ?? (await fetchRecentOrders(container, 1))[0]?.id ?? null
  const raw = orderId ? await fetchOrder(container, orderId) : null
  const order = raw ? toOrderView(raw, locale) : sampleOrder(locale)
  const email = order.email ?? "customer@example.com"

  const url = (name: string, values: Record<string, string | number | null | undefined> = {}) =>
    buildUrl(options, name, { locale, email, ...values })
  const orderUrl = url("order", { order_id: order.id, display_id: order.display_id, country_code: order.country_code })
  const actions: Record<string, string | undefined> = {
    welcome: url("store"),
    "password-reset": url("passwordReset", { token: "preview-token" }) ?? "https://example.com/reset-password",
    "email-verification": url("emailVerification", { code: "123456" }),
    "team-new-order": url("adminOrder", { order_id: order.id }),
    "team-payment-failed": url("adminOrder", { order_id: order.id }),
    "team-low-stock": url("adminInventory"),
  }
  const action = type in actions ? actions[type] : orderUrl

  return {
    loaded: {
      data: sampleData(type, order, { action: action ?? null }),
      to: getDefinition(options, type)?.audience === "team" ? null : email,
      locale,
    },
    order: raw ? { id: order.id, display_id: order.display_id } : null,
  }
}
