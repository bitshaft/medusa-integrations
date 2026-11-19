import type { AuthenticatedMedusaRequest, MedusaRequest } from "@medusajs/framework/http"

import { resolveCurrency } from "../runtime"

/** The module with its options; throws the "disabled" error when the options are invalid. */
export async function resolveEnabled(req: MedusaRequest) {
  const service = resolveCurrency(req.scope)
  const options = await service.getOptions()
  return { service, options }
}

export const actorId = (req: MedusaRequest): string | null =>
  (req as AuthenticatedMedusaRequest).auth_context?.actor_id ?? null
