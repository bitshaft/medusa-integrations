import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/emails/api/utils"
import type { AdminUpdateThemeBody } from "../../../../lib/emails/api/validators"
import type { EmailsPluginOptions } from "../../../../lib/emails/options"
import { THEME_KEY } from "../../../../lib/emails/settings"
import { cleanTheme, type StoredTheme } from "../../../../lib/emails/theme"

/** The saved theme and the look from the plugin options it is laid over. */
function describe(options: EmailsPluginOptions, theme: StoredTheme) {
  const { brand } = options
  return {
    theme,
    defaults: {
      colors: brand.colors,
      font: brand.style.font,
      button_shape: brand.style.buttonShape,
      card_shape: brand.style.cardShape,
      header_align: brand.style.headerAlign,
      logo_url: brand.logoUrl ?? null,
      logo_width: brand.logoWidth,
    },
  }
}

/** `GET /admin/emails/theme`: colours, font, shapes and logo of the emails. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { options, settings } = await resolveEnabled(req)
  res.json(describe(options, settings.theme))
}

/**
 * `POST /admin/emails/theme` with the whole theme. A field left out follows
 * the plugin options; `{ theme: null }` restores the options entirely.
 */
export async function POST(req: MedusaRequest<AdminUpdateThemeBody>, res: MedusaResponse) {
  const { emails, options } = await resolveEnabled(req)
  const theme = req.validatedBody.theme ? cleanTheme(req.validatedBody.theme) : null
  await emails.saveSetting(THEME_KEY, theme && Object.keys(theme).length ? theme : null)
  res.json(describe(options, (await emails.getSettings()).theme))
}
