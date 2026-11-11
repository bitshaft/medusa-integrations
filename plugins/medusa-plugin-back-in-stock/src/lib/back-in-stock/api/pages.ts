import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { loadProducts } from "../catalog"
import { COPY, interpolate } from "../copy"
import { HOOKS_PATH } from "../links"
import { fillUrl, type Locale, normalizeLocale } from "../options"
import { productLabel, renderPage } from "../render"
import { resolveBackInStock } from "../runtime"
import { confirmByToken, type TokenActionResult, unsubscribeByToken } from "../subscriptions"
import { isWellFormedToken } from "../tokens"
import type { SubscriptionRecord } from "../types"

type Action = "confirm" | "unsubscribe"

/**
 * The pages behind the confirm and unsubscribe links in emails.
 *
 * GET never acts, because mail scanners open links: it redirects to the
 * storefront page from `urls.confirm` / `urls.unsubscribe` when set, or
 * shows a page with a button. The action happens on POST (the button, or a
 * mail client's one-click unsubscribe).
 */
export async function handleLinkPage(req: MedusaRequest, res: MedusaResponse, action: Action, method: "GET" | "POST") {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Robots-Tag", "noindex")

  const service = resolveBackInStock(req.scope)
  if (!(await service.isEnabled())) {
    return send(
      res,
      404,
      renderPage({ locale: "en", title: COPY.en.pages.invalidTitle, text: COPY.en.pages.invalidText })
    )
  }
  const options = await service.getOptions()
  const token = req.params.token
  const found = isWellFormedToken(token) ? await service.findByToken(token, action) : null
  const locale = normalizeLocale(found?.subscription.locale, options.defaultLocale)
  const pages = COPY[locale].pages

  if (method === "GET") {
    const template = options.urls[action]
    if (template && isWellFormedToken(token)) {
      const url = fillUrl(template, { storefrontUrl: options.storefrontUrl, token, locale })
      if (url) {
        return res.redirect(302, url)
      }
    }
    if (!found || isEnded(found.subscription, action)) {
      return send(res, 404, renderPage({ locale, title: pages.invalidTitle, text: pages.invalidText }))
    }
    const label = await labelOf(req, found.subscription)
    return send(
      res,
      200,
      action === "confirm"
        ? renderPage({
            locale,
            title: pages.confirmTitle,
            text: interpolate(pages.confirmText, { product_label: label }),
            formAction: `${HOOKS_PATH}/confirm/${encodeURIComponent(token)}`,
            button: pages.confirmButton,
          })
        : renderPage({
            locale,
            title: pages.unsubscribeTitle,
            text: interpolate(pages.unsubscribeText, { product_label: label }),
            formAction: `${HOOKS_PATH}/unsubscribe/${encodeURIComponent(token)}`,
            button: pages.unsubscribeButton,
          })
    )
  }

  const result: TokenActionResult = !isWellFormedToken(token)
    ? { outcome: "invalid", subscription: null }
    : action === "confirm"
      ? await confirmByToken(req.scope, token)
      : await unsubscribeByToken(req.scope, token)
  if (result.outcome === "invalid" || !result.subscription) {
    return send(res, 404, renderPage({ locale, title: pages.invalidTitle, text: pages.invalidText }))
  }
  const label = await labelOf(req, result.subscription)
  return send(
    res,
    200,
    action === "confirm"
      ? renderPage({
          locale,
          title: pages.confirmedTitle,
          text: interpolate(pages.confirmedText, { product_label: label }),
        })
      : renderPage({
          locale,
          title: pages.unsubscribedTitle,
          text: interpolate(pages.unsubscribedText, { product_label: label }),
        })
  )
}

/** A confirm link is useless once the alert is active or ended; an unsubscribe link once it ended. */
function isEnded(subscription: SubscriptionRecord, action: Action): boolean {
  return action === "confirm" ? subscription.status !== "pending" : !["pending", "active"].includes(subscription.status)
}

async function labelOf(req: MedusaRequest, subscription: SubscriptionRecord): Promise<string> {
  const product = (await loadProducts(req.scope, [subscription.variant_id])).get(subscription.variant_id)
  return product ? productLabel(product.product_title, product.variant_title) : ""
}

function send(res: MedusaResponse, status: number, html: string) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(html)
}

export type { Locale }
