import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { handleLinkPage } from "../../../../../lib/back-in-stock/api/pages"

/** `GET /hooks/back-in-stock/unsubscribe/:token` — shows the unsubscribe page (or redirects to the storefront). Never acts. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await handleLinkPage(req, res, "unsubscribe", "GET")
}

/**
 * `POST /hooks/back-in-stock/unsubscribe/:token` — unsubscribes. Also the
 * target of mail clients' one-click unsubscribe (RFC 8058).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await handleLinkPage(req, res, "unsubscribe", "POST")
}
