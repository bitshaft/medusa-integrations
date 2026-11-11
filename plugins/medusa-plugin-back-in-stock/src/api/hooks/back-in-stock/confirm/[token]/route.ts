import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { handleLinkPage } from "../../../../../lib/back-in-stock/api/pages"

/** `GET /hooks/back-in-stock/confirm/:token` — shows the confirm page (or redirects to the storefront). Never acts. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await handleLinkPage(req, res, "confirm", "GET")
}

/** `POST /hooks/back-in-stock/confirm/:token` — confirms the subscription. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await handleLinkPage(req, res, "confirm", "POST")
}
