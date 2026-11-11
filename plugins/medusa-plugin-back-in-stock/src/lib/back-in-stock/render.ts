import { COPY, type EmailCopy, interpolate } from "./copy"
import type { Locale } from "./options"

/** What a back-in-stock or confirmation email shows. */
export type EmailView = {
  kind: "restock" | "confirm"
  locale: Locale
  store_name: string
  product_title: string
  variant_title: string | null
  /** `Product · Variant`, or the product title alone. */
  product_label: string
  thumbnail: string | null
  /** The button: product page for restocks, confirm link for confirmations. */
  action_url: string | null
  unsubscribe_url: string | null
}

export type RenderedEmail = { subject: string; html: string; text: string }

export function productLabel(productTitle: string, variantTitle: string | null | undefined): string {
  const variant = variantTitle?.trim()
  return variant && variant !== productTitle && !/^default( variant)?$/i.test(variant)
    ? `${productTitle} · ${variant}`
    : productTitle
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

/**
 * The built-in template, used when @bitshaft/medusa-plugin-emails is not
 * installed. Plain, table-based HTML that renders in every mail client,
 * plus a text version. Everything inserted is escaped.
 */
export function renderEmail(view: EmailView): RenderedEmail {
  const copy = COPY[view.locale]
  const variables = { store_name: view.store_name, product_label: view.product_label }
  const fill = (key: keyof EmailCopy) => interpolate(copy[view.kind][key], variables)
  const action = safeUrl(view.action_url)
  const unsubscribe = safeUrl(view.unsubscribe_url)
  const image = safeUrl(view.thumbnail)
  const subject = fill("subject")

  const paragraph = (text: string, style = "margin:0 0 16px;font-size:15px;line-height:24px;color:#18181b") =>
    `<p style="${style}">${escapeHtml(text)}</p>`
  const small = "margin:0 0 8px;font-size:13px;line-height:20px;color:#71717a"

  const html =
    `<!DOCTYPE html><html lang="${view.locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:24px 0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">` +
    `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(fill("preview"))}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">` +
    `<tr><td style="padding:8px 0 24px;text-align:center;font-size:20px;font-weight:700;color:#18181b">${escapeHtml(view.store_name)}</td></tr>` +
    `<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:32px 28px 16px">` +
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;color:#18181b">${escapeHtml(fill("heading"))}</h1>` +
    (image && view.kind === "restock"
      ? `<p style="margin:0 0 16px"><img src="${escapeHtml(image)}" alt="${escapeHtml(view.product_label)}" width="160" style="max-width:160px;border-radius:6px"></p>`
      : "") +
    paragraph(fill("body")) +
    (action
      ? `<p style="margin:8px 0 24px"><a href="${escapeHtml(action)}" style="display:inline-block;background:#18181b;color:#ffffff;border-radius:6px;padding:12px 20px;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(fill("button"))}</a></p>`
      : "") +
    paragraph(fill("footnote"), small) +
    `</td></tr>` +
    `<tr><td style="padding:20px 12px 0;text-align:center">` +
    paragraph(interpolate(copy.footer.reason, variables), small) +
    (unsubscribe
      ? `<p style="${small}"><a href="${escapeHtml(unsubscribe)}" style="color:#71717a;text-decoration:underline">${escapeHtml(copy.footer.unsubscribe)}</a></p>`
      : "") +
    `</td></tr></table></td></tr></table></body></html>`

  const text = [
    fill("heading"),
    "",
    fill("body"),
    ...(action ? ["", `${fill("button")}: ${action}`] : []),
    "",
    fill("footnote"),
    "",
    interpolate(copy.footer.reason, variables),
    ...(unsubscribe ? [`${copy.footer.unsubscribe}: ${unsubscribe}`] : []),
  ].join("\n")

  return { subject, html, text }
}

/** A small page for the confirm and unsubscribe links (shown by `/hooks/back-in-stock/…`). */
export function renderPage(input: {
  locale: Locale
  title: string
  text: string
  /** Shows a button that POSTs to this URL. */
  formAction?: string
  button?: string
}): string {
  return (
    `<!DOCTYPE html><html lang="${input.locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>${escapeHtml(input.title)}</title></head>` +
    `<body style="margin:0;padding:48px 16px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18181b">` +
    `<main style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:32px 28px">` +
    `<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(input.title)}</h1>` +
    `<p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#3f3f46">${escapeHtml(input.text)}</p>` +
    (input.formAction && input.button
      ? `<form method="post" action="${escapeHtml(input.formAction)}"><button type="submit" style="background:#18181b;color:#fff;border:0;border-radius:6px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer">${escapeHtml(input.button)}</button></form>`
      : "") +
    `</main></body></html>`
  )
}
