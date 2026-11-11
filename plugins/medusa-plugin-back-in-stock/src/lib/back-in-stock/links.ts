import { type BackInStockPluginOptions, fillUrl } from "./options"

export const HOOKS_PATH = "/hooks/back-in-stock"

export type ActionLink = {
  url: string
  /**
   * The link is the plugin's own hooks page, which also accepts a POST that
   * acts at once. Mail clients may then offer one-click unsubscribe.
   */
  one_click: boolean
}

/**
 * The confirm or unsubscribe link for a token: the storefront page from
 * `urls.confirm` / `urls.unsubscribe` when set, otherwise the plugin's own
 * page under `/hooks/back-in-stock/…`. Opening either link never acts by
 * itself: mail scanners open links too.
 */
export function actionLink(
  options: Pick<BackInStockPluginOptions, "backendUrl" | "storefrontUrl" | "urls">,
  action: "confirm" | "unsubscribe",
  token: string,
  locale: string
): ActionLink | null {
  const template = options.urls[action]
  if (template) {
    const url = fillUrl(template, { storefrontUrl: options.storefrontUrl, token, locale })
    return url ? { url, one_click: false } : null
  }
  if (!options.backendUrl) {
    return null
  }
  return {
    url: `${options.backendUrl.replace(/\/+$/, "")}${HOOKS_PATH}/${action}/${encodeURIComponent(token)}`,
    one_click: action === "unsubscribe",
  }
}

export type ProductInfo = {
  variant_id: string
  variant_title: string | null
  sku: string | null
  product_id: string | null
  product_title: string
  handle: string | null
  thumbnail: string | null
}

/** The product page for the "view product" button; undefined when the template cannot be filled. */
export function productLink(
  options: Pick<BackInStockPluginOptions, "storefrontUrl" | "urls">,
  product: ProductInfo,
  context: { country_code: string | null; locale: string }
): string | undefined {
  return fillUrl(options.urls.product, {
    storefrontUrl: options.storefrontUrl,
    handle: product.handle,
    variant_id: product.variant_id,
    product_id: product.product_id,
    country_code: context.country_code,
    locale: context.locale,
  })
}
