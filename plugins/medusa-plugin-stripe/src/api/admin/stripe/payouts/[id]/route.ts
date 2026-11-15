import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { decimal, sendCsv, source } from "../../../../../lib/stripe/api/utils"
import type { AdminPayoutQuery } from "../../../../../lib/stripe/api/validators"
import { demoPayoutDetail } from "../../../../../lib/stripe/demo"
import { payoutDetail } from "../../../../../lib/stripe/server/views"

/**
 * `GET /admin/stripe/payouts/:id?format=csv`: the transactions, refunds and
 * fees of a payout with their orders; `missing_order` marks items that
 * should have one. The CSV is for accounting.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { format, refresh } = req.validatedQuery as unknown as AdminPayoutQuery
  if (!/^po_[A-Za-z0-9_]+$/.test(req.params.id))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Not a payout id.")
  const from = source(req)
  const result = from.demo
    ? demoPayoutDetail(req.params.id)
    : await payoutDetail(req.scope, from.reader, req.params.id, { fresh: refresh })
  if (format === "csv") {
    sendCsv(
      res,
      `stripe-${result.payout.id}`,
      [
        "date",
        "type",
        "transaction",
        "payment_intent",
        "currency",
        "amount",
        "fee",
        "net",
        "order",
        "without_order",
        "description",
      ],
      result.items.map((i) => [
        new Date(i.created * 1000).toISOString(),
        i.type,
        i.id,
        i.payment_intent ?? "",
        i.currency.toUpperCase(),
        decimal(i.amount, i.currency),
        decimal(i.fee, i.currency),
        decimal(i.net, i.currency),
        i.order?.display_id ? `#${i.order.display_id}` : (i.order?.id ?? ""),
        i.missing_order ? "yes" : "",
        i.description ?? "",
      ]),
      result
    )
    return
  }
  res.json({ demo: from.demo, ...result })
}
