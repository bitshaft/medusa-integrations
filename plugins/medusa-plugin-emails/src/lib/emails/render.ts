import { MedusaError } from "@medusajs/framework/utils"
import { toPlainText } from "@react-email/components"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { COMMON_GROUP, type CopyOverrides, interpolateGroup, resolveCopy } from "./copy"
import { createFormatters } from "./format"
import type { EmailLocale } from "./locales"
import { type EmailsPluginOptions, resolveBrand } from "./options"
import { customCopyFor, getDefinition, templateFor } from "./registry"
import type { StoredTheme } from "./theme"
import type { EmailData } from "./types"
import { buildVariables, withOptionalBlanks } from "./variables"

export type RenderEmailInput = {
  options: EmailsPluginOptions
  type: string
  locale: EmailLocale
  data: EmailData
  /** Admin edits of this type's text and of the shared labels. */
  overrides?: { type?: CopyOverrides; common?: CopyOverrides }
  /** The store's name in Medusa, used when `brand.name` is not set. */
  storeName?: string | null
  /** The admin's theme from the Appearance tab. */
  theme?: StoredTheme
}

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'

export type RenderedEmail = { subject: string; html: string; text: string }

/** Renders one email to a subject, HTML and plain text. */
export async function renderEmail(input: RenderEmailInput): Promise<RenderedEmail> {
  const { options, type, locale, data } = input
  const definition = getDefinition(options, type)
  if (!definition) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown email type "${type}". Register it in the "templates" option of the emails plugin.`
    )
  }

  const brand = resolveBrand(options, locale, input.storeName, input.theme)
  const format = createFormatters(locale)
  const variables = withOptionalBlanks(buildVariables(data, brand, format))

  const base = options.defaultLocale
  const copy = interpolateGroup(
    resolveCopy(type, locale, { base, custom: customCopyFor(options, type), overrides: input.overrides?.type }),
    variables
  )
  const common = interpolateGroup(
    resolveCopy(COMMON_GROUP, locale, {
      base,
      custom: customCopyFor(options, COMMON_GROUP),
      overrides: input.overrides?.common,
    }),
    variables
  )

  const subject = (copy.subject ?? "").replace(/\s+/g, " ").trim()
  if (!subject) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The email type "${type}" has no subject. Add "subject" to its copy in the "templates" option.`
    )
  }

  const element = createElement(templateFor(options, type), {
    data,
    copy,
    common,
    brand,
    locale,
    format,
    audience: definition.audience,
  })
  // Same output as React Email's `render`, without its dynamic import of
  // react-dom (which needs extra flags under Jest) and without streaming.
  const html = DOCTYPE + renderToStaticMarkup(element).replace(/<!DOCTYPE.*?>/, "")
  return { subject, html, text: toPlainText(html) }
}
