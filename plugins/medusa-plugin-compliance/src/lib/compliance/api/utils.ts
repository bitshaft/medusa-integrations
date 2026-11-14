import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { normalizeEmail } from "../requests"
import type { Actor } from "../server/consents"
import { normalizeLocale } from "../format"
import { pluginDisabledError } from "../kit/options"
import { ComplianceError } from "../messages"
import { PLUGIN_NAME } from "../options"
import { hashIp } from "../requests"
import type { ModuleKey } from "../settings"
import { resolveCompliance } from "../server/runtime"
import type { Locale } from "../types"

/** The module service, or a clear "disabled" error when the plugin options are invalid. */
export async function requireEnabled(req: MedusaRequest) {
  const service = resolveCompliance(req.scope)
  if (!(await service.isEnabled())) {
    throw pluginDisabledError(PLUGIN_NAME, (await service.disabledReason()) ?? "invalid options")
  }
  return service
}

/** For admin routes: the module must be switched on in the settings. */
export async function requireModule(req: MedusaRequest, key: ModuleKey) {
  const service = await requireEnabled(req)
  if (!(await service.getSettings()).modules[key]) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `The ${key.toUpperCase()} module is switched off. Switch it on in Compliance → Settings.`
    )
  }
  return service
}

/** For store routes: the same check, with a bilingual message for customers. */
export async function requireStoreModule(req: MedusaRequest, key: ModuleKey) {
  const service = resolveCompliance(req.scope)
  if (!(await service.isEnabled()) || !(await service.getSettings()).modules[key]) {
    throw new ComplianceError("module_disabled")
  }
  return service
}

export async function isDemo(req: MedusaRequest): Promise<boolean> {
  return (await resolveCompliance(req.scope).getSettings()).demo
}

/**
 * In demo mode the admin works on sample data: every change except the
 * settings themselves is refused, so nothing real is touched.
 */
export async function refuseInDemo(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  try {
    if (req.method !== "GET" && (await isDemo(req))) {
      return next(
        new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Demo mode is on: changes are not saved. Switch demo mode off in Compliance → Settings to work on real data."
        )
      )
    }
  } catch (error) {
    return next(error)
  }
  next()
}

export function optionalCustomerId(req: MedusaRequest): string | null {
  return (req as AuthenticatedMedusaRequest).auth_context?.actor_id ?? null
}

export function customerId(req: MedusaRequest): string {
  const id = optionalCustomerId(req)
  if (!id) throw new ComplianceError("not_signed_in")
  return id
}

export function adminActor(req: MedusaRequest): Actor {
  return { type: "user", id: (req as AuthenticatedMedusaRequest).auth_context?.actor_id ?? null }
}

/** The customer's language: `locale`, then `x-medusa-locale`, then `Accept-Language`, then the plugin default. */
export async function requestLocale(req: MedusaRequest, explicit?: string): Promise<Locale> {
  const { defaultLocale } = await resolveCompliance(req.scope).getOptions()
  return normalizeLocale(explicit ?? req.get("x-medusa-locale") ?? req.get("accept-language"), defaultLocale)
}

/** A salted hash of the caller's IP, for the rate limit; the IP itself is never stored. */
export async function ipHash(req: MedusaRequest): Promise<string | null> {
  return hashIp(req.ip ?? req.socket?.remoteAddress ?? null, await resolveCompliance(req.scope).ipSalt())
}

export { normalizeEmail }

const STATUS: Record<string, number> = {
  [MedusaError.Types.NOT_FOUND]: 404,
  [MedusaError.Types.NOT_ALLOWED]: 400,
  [MedusaError.Types.UNAUTHORIZED]: 401,
  [MedusaError.Types.INVALID_DATA]: 400,
}

/**
 * Wraps a store route: refusals answer in the customer's language with a
 * machine-readable `code` and both texts.
 */
export function storeRoute<Req extends MedusaRequest>(
  handler: (req: Req, res: MedusaResponse) => Promise<void>
): (req: Req, res: MedusaResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (!(error instanceof ComplianceError)) throw error
      const body = (req.body ?? {}) as { locale?: string }
      const locale = await requestLocale(req, (req.query?.locale as string) ?? body.locale)
      const status = error.code === "rate_limited" ? 429 : (STATUS[error.type] ?? 400)
      res.status(status).json({
        type: error.type,
        code: error.code,
        message: error.localized(locale),
        messages: { pl: error.localized("pl"), en: error.localized("en") },
      })
    }
  }
}

type Schema = {
  safeParse: (value: unknown) => {
    success: boolean
    data?: unknown
    error?: { issues: Array<{ path: PropertyKey[]; message: string }> }
  }
}

const details = (issues: Array<{ path: PropertyKey[]; message: string }>) =>
  issues.map((issue) => `${issue.path.map(String).join(".") || "body"}: ${issue.message}`).join("; ")

/** Store validation: refusals carry a code and a message in both languages. */
export function validateStoreBody(schema: Schema) {
  return (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) return next(new ComplianceError("invalid_input", { details: details(result.error!.issues) }))
    ;(req as unknown as { validatedBody: unknown }).validatedBody = result.data
    next()
  }
}

export function validateStoreQuery(schema: Schema) {
  return (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
    const result = schema.safeParse(req.query ?? {})
    if (!result.success) return next(new ComplianceError("invalid_input", { details: details(result.error!.issues) }))
    req.validatedQuery = result.data as Record<string, unknown>
    next()
  }
}
