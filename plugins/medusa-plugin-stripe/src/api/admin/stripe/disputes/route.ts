import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { source } from "../../../../lib/stripe/api/utils"
import type { AdminRefreshQuery } from "../../../../lib/stripe/api/validators"
import { demoDisputes } from "../../../../lib/stripe/demo"
import { disputes } from "../../../../lib/stripe/server/views"

/** `GET /admin/stripe/disputes`: open disputes, nearest evidence deadline first; `urgent` under 3 days. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { refresh } = req.validatedQuery as unknown as AdminRefreshQuery
  const from = source(req)
  res.json(
    from.demo
      ? { demo: true, ...demoDisputes() }
      : { demo: false, ...(await disputes(req.scope, from.reader, { fresh: refresh })) }
  )
}
