import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveCompliance } from "./runtime"

/** The actor in a bearer token, read without verifying it: used only to refuse, never to allow. */
export function bearerActor(header: string | undefined): { actor_id?: string; actor_type?: string } | null {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]
  const payload = token?.split(".")[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
}

/**
 * Medusa does not look up the customer behind a session or a JWT on every
 * request, so a token issued before an anonymisation would keep working
 * until it expires. This middleware refuses sessions and tokens of
 * anonymised customers and ends the session.
 */
export async function refuseAnonymizedCustomers(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const session = (
      req as unknown as {
        session?: { auth_context?: { actor_id?: string; actor_type?: string }; destroy?: (cb: () => void) => void }
      }
    ).session
    const fromSession = session?.auth_context
    const fromToken = bearerActor(req.headers.authorization)
    const actor = [fromSession, fromToken].find((a) => a?.actor_type === "customer" && a.actor_id)
    if (actor?.actor_id && (await resolveCompliance(req.scope).isAnonymized(actor.actor_id))) {
      if (fromSession?.actor_id === actor.actor_id)
        await new Promise<void>((done) => session!.destroy?.(done) ?? done())
      res
        .status(401)
        .json({ type: "unauthorized", message: "This account no longer exists. / To konto już nie istnieje." })
      return
    }
  } catch {
    // Never block a request because the check itself failed.
  }
  next()
}
