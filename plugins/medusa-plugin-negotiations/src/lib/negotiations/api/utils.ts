import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"

import { NegotiationError, normalizeLocale } from "../messages"
import { resolveNegotiations } from "../server/runtime"
import { customerView, teamView, type ThreadRecord } from "../views"

/** Parses a body or query; a refusal carries a code and both languages, like every other refusal. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value ?? {})
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.map(String).join(".") || "body"}: ${i.message}`).join("; ")
    throw new NegotiationError("invalid_input", { details })
  }
  return result.data
}

export const actorId = (req: MedusaRequest): string | null =>
  (req as AuthenticatedMedusaRequest).auth_context?.actor_id ?? null

/** The thread as a customer may see it, with the options that shape its `can` flags. */
export async function customerThreadView(req: MedusaRequest, thread: ThreadRecord, withMessages: boolean) {
  const service = resolveNegotiations(req.scope)
  const [options, settings] = await Promise.all([service.getOptions(), service.getSettings()])
  const messages = withMessages ? await service.listMessages(thread.id, { internal: false }) : null
  return customerView(thread, messages, {
    expiryDays: options.expiryDays,
    customerAccept: options.customerAccept,
    cartWriter: options.writers.cart && settings.armed.cart,
  })
}

/**
 * Store routes: refusals answer with a `code`, the message in the
 * customer's language (`x-medusa-locale`, then `Accept-Language`, Polish by
 * default), both texts, and for conflicts the current thread.
 */
export function storeRoute(handler: (req: MedusaRequest, res: MedusaResponse) => Promise<void>) {
  return async (req: MedusaRequest, res: MedusaResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (!(error instanceof NegotiationError)) throw error
      const locale = normalizeLocale(req.get("x-medusa-locale") ?? req.get("accept-language"))
      const thread =
        error.state && (error.state as ThreadRecord).customer_id === actorId(req)
          ? await customerThreadView(req, error.state as ThreadRecord, true)
          : undefined
      res.status(error.httpStatus).json({
        type: error.type,
        code: error.code,
        message: error.localized(locale),
        messages: { pl: error.localized("pl"), en: error.localized("en") },
        ...(thread ? { negotiation: thread } : {}),
      })
    }
  }
}

/** Admin routes: the same shape in English, with the team's view of the current thread on conflicts. */
export function adminRoute(handler: (req: MedusaRequest, res: MedusaResponse) => Promise<void>) {
  return async (req: MedusaRequest, res: MedusaResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (!(error instanceof NegotiationError)) throw error
      const { expiryDays } = await resolveNegotiations(req.scope).getOptions()
      const extra = error as NegotiationError & { floors?: unknown }
      res.status(error.httpStatus).json({
        type: error.type,
        code: error.code,
        params: error.params,
        message: error.message,
        ...(error.state ? { negotiation: teamView(error.state as ThreadRecord, { expiryDays }) } : {}),
        ...(extra.floors ? { floors: extra.floors } : {}),
      })
    }
  }
}
