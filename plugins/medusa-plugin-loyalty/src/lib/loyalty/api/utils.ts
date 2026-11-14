import type { AuthenticatedMedusaRequest, MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { normalizeLocale } from "../format"
import { pluginDisabledError } from "../kit/options"
import { LoyaltyError } from "../messages"
import { PLUGIN_NAME } from "../options"
import { resolveLoyalty } from "../server/runtime"
import type { Locale } from "../types"

/** The module service, or a clear "disabled" error when the plugin options are invalid. */
export async function requireEnabled(req: MedusaRequest) {
  const service = resolveLoyalty(req.scope)
  if (!(await service.isEnabled())) {
    throw pluginDisabledError(PLUGIN_NAME, (await service.disabledReason()) ?? "invalid options")
  }
  return service
}

/** The signed-in customer, or a bilingual "sign in" error. */
export function customerId(req: MedusaRequest): string {
  const id = (req as AuthenticatedMedusaRequest).auth_context?.actor_id
  if (!id) throw new LoyaltyError("not_signed_in")
  return id
}

export function optionalCustomerId(req: MedusaRequest): string | null {
  return (req as AuthenticatedMedusaRequest).auth_context?.actor_id ?? null
}

export function adminId(req: MedusaRequest): string | null {
  return (req as AuthenticatedMedusaRequest).auth_context?.actor_id ?? null
}

/** The customer's language: `locale`, then `x-medusa-locale`, then `Accept-Language`, then the plugin default. */
export async function requestLocale(req: MedusaRequest, explicit?: string): Promise<Locale> {
  const { defaultLocale } = await resolveLoyalty(req.scope).getOptions()
  return normalizeLocale(explicit ?? req.get("x-medusa-locale") ?? req.get("accept-language"), defaultLocale)
}

export function notFound(what: string): MedusaError {
  return new MedusaError(MedusaError.Types.NOT_FOUND, `${what} was not found.`)
}
