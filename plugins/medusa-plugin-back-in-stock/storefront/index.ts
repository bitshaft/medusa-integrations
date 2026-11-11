/**
 * Storefront kit for @bitshaft/medusa-plugin-back-in-stock.
 *
 * Copy this folder into your storefront (see README.md) and import from it:
 *
 * ```tsx
 * import { NotifyMe } from "@modules/products/components/back-in-stock"
 * ```
 */
export { getConsent, listMySubscriptions, subscribe, unsubscribeMine, applyToken } from "./client"
export { NOTIFY_ME_LABELS, NotifyMe, type NotifyMeLabels, type NotifyMeProps } from "./notify-me"
export {
  BackInStockError,
  type BackInStockStoreConfig,
  type BackInStockSubscription,
  type Consent,
  type SubscribeParams,
  type SubscribeResult,
  type TokenOutcome,
} from "./types"
