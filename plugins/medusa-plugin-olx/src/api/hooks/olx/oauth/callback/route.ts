import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { exchangeCode } from "../../../../../lib/olx/auth"
import { OlxClient } from "../../../../../lib/olx/client"
import { adminReturnUrl } from "../../../../../lib/olx/options"
import { resolveOlx } from "../../../../../lib/olx/runtime"

export const AUTHENTICATE = false

const text = (value: unknown) => (typeof value === "string" ? value : "")

/**
 * `GET /hooks/olx/oauth/callback` — where OLX returns the browser. Public,
 * so only a state started by an admin moments ago is accepted, once. The
 * browser always goes back to the configured admin address.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  if (!(await service.isEnabled())) {
    return res.status(404).send("The OLX plugin is disabled.")
  }
  const options = await service.getOptions()
  const back = (result: string) => {
    const url = new URL(adminReturnUrl(options), "http://relative.invalid")
    url.searchParams.set("tab", "settings")
    url.searchParams.set("connected", result)
    const target = url.origin === "http://relative.invalid" ? `${url.pathname}${url.search}` : url.toString()
    res.redirect(302, target)
  }

  const state = text(req.query.state)
  if (options.demo || !state || !(await service.consumeOauthState(state))) {
    return back("invalid_state")
  }
  const code = text(req.query.code)
  if (!code) {
    return back("denied")
  }
  try {
    const tokens = await exchangeCode(options, logger, code)
    const client = new OlxClient({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      clientSecret: options.clientSecret,
      logger,
      token: async () => tokens.access_token,
    })
    const user = await client.me().catch(() => null)
    await service.connect(tokens, {
      id: user?.id !== undefined ? String(user.id) : null,
      name: user?.name ?? null,
      is_business: Boolean(user?.is_business),
    })
    logger.info("[olx] Account connected")
    return back("ok")
  } catch (error) {
    logger.warn(`[olx] Connecting the account failed: ${(error as Error).message}`)
    return back("failed")
  }
}
