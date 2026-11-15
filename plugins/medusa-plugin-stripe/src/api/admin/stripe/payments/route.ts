import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { decimal, sendCsv, source } from "../../../../lib/stripe/api/utils"
import type { AdminPaymentsQuery } from "../../../../lib/stripe/api/validators"
import { demoPayments } from "../../../../lib/stripe/demo"
import { payments } from "../../../../lib/stripe/server/views"

/**
 * `GET /admin/stripe/payments?days=&status=&method=&currency=&format=csv`:
 * PaymentIntents with method, decline reason, Radar risk, fee, net and the
 * Medusa order; `orphan` marks paid payments without an order.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.validatedQuery as unknown as AdminPaymentsQuery
  const from = source(req)
  const result = from.demo
    ? {
        partial: false,
        missed: [] as string[],
        truncated: [] as string[],
        payments: demoPayments().filter(
          (p) =>
            p.created >= Date.now() / 1000 - query.days * 86_400 &&
            (!query.status || p.status === query.status) &&
            (!query.method || p.method === query.method) &&
            (!query.currency || p.currency === query.currency.toLowerCase())
        ),
      }
    : await payments(req.scope, from.reader, { ...query, fresh: query.refresh })

  if (query.format === "csv") {
    sendCsv(
      res,
      "stripe-payments",
      [
        "date",
        "payment_intent",
        "status",
        "method",
        "currency",
        "amount",
        "fee",
        "net",
        "decline_code",
        "risk_level",
        "order",
        "without_order",
      ],
      result.payments.map((p) => [
        new Date(p.created * 1000).toISOString(),
        p.id,
        p.status,
        p.method_label,
        p.currency.toUpperCase(),
        decimal(p.amount, p.currency),
        decimal(p.fee, p.currency),
        decimal(p.net, p.currency),
        p.decline?.code ?? "",
        p.risk_level ?? "",
        p.order?.display_id ? `#${p.order.display_id}` : (p.order?.id ?? ""),
        p.orphan ? "yes" : "",
      ]),
      result
    )
    return
  }
  res.json({ demo: from.demo, ...result })
}
