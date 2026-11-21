import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { writeView } from "../../../../../../lib/olx/api/utils"
import { activateAdvert, deactivateAdvert, flushDeactivation } from "../../../../../../lib/olx/engine"
import { buildEngine } from "../../../../../../lib/olx/runtime"
import { markOlxAdvertSoldWorkflow } from "../../../../../../workflows/olx"

/**
 * `POST /admin/olx/adverts/:id/commands` — `deactivate`, `activate`, or
 * `sold`: the item went to an OLX buyer, so store stock is cleared first and
 * the advert comes down (repeated by the sync job if OLX does not answer).
 */
export async function POST(req: MedusaRequest<{ command: "deactivate" | "activate" | "sold" }>, res: MedusaResponse) {
  const engine = await buildEngine(req.scope)
  const { id } = req.params
  const { command } = req.validatedBody
  if (command === "deactivate") {
    return res.json(writeView(await deactivateAdvert(engine, id)))
  }
  if (command === "activate") {
    return res.json(writeView(await activateAdvert(engine, id)))
  }
  const row = await engine.store.getRecord(id)
  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `OLX advert ${id} was not found.`)
  }
  if (!row.olx_advert_id) {
    return res.json({ result: "conflict", code: "not_on_olx" })
  }
  const { result: marked } = await markOlxAdvertSoldWorkflow(req.scope).run({
    input: { advert_id: id, variant_id: row.variant_id },
  })
  const advert = await flushDeactivation(engine, marked)
  res.json(
    writeView(
      advert.pending_deactivate
        ? { result: "unconfirmed", advert, message: advert.last_error ?? "OLX did not confirm yet." }
        : { result: "saved", advert }
    )
  )
}
