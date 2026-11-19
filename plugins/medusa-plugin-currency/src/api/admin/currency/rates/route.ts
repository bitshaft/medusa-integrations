import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/currency/api/utils"
import { currentRates } from "../../../../lib/currency/fill"
import { loadStoreContext } from "../../../../lib/currency/fill/load"
import { resolveRate } from "../../../../lib/currency/rates"
import { ruleFor } from "../../../../lib/currency/settings"

/**
 * `GET /admin/currency/rates` — the current table with its number and date,
 * from the cache until a newer one is due, and the rate each store currency
 * gets under its rule. `?refresh=true` asks the source now.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const query = (req.validatedQuery ?? {}) as { refresh?: string }
  const lookup = await currentRates(req.scope, query.refresh === "true")
  const settings = await service.getSettings()
  const store = await loadStoreContext(req.scope, settings)
  const base = store.base?.code ?? null
  const currencies = base
    ? store.currencies
        .filter((currency) => currency.code !== base)
        .map((currency) => {
          const rule = ruleFor(settings, currency.code)
          const resolved = resolveRate({ base, target: currency.code, rule, lookup, allowStale: true })
          return {
            code: currency.code,
            enabled: rule.enabled,
            mode: rule.mode,
            rate: resolved.ok ? resolved.rate : null,
            reason: resolved.ok ? null : resolved.reason,
          }
        })
    : []
  res.json({ provider: options.provider, demo: options.demo, base, currencies, ...lookup })
}
