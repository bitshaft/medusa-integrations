import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { authorizeUrl } from "../../../../lib/olx/auth"
import { resolveOlx } from "../../../../lib/olx/runtime"

/** `POST /admin/olx/connection` — starts connecting: the address of OLX's consent screen. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  const options = await service.getOptions()
  if (options.demo) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Demo mode needs no OLX account.")
  }
  const state = await service.startOauth()
  res.json({ url: authorizeUrl(options, state) })
}

/** `DELETE /admin/olx/connection` — forgets the account. Adverts stay on OLX. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  await service.getOptions()
  await service.disconnect()
  res.json({ connection: await service.describeConnection() })
}
