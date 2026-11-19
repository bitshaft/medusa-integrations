import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveEnabled } from "../../../../lib/currency/api/utils"
import type { AdminSuggestType } from "../../../../lib/currency/api/validators"
import { currentRates } from "../../../../lib/currency/fill"
import { loadStoreContext } from "../../../../lib/currency/fill/load"
import { resolveRate, type RateLookup } from "../../../../lib/currency/rates"
import { ruleFor } from "../../../../lib/currency/settings"
import { type SuggestContext, suggestPrices } from "../../../../lib/currency/suggest"

/**
 * `POST /admin/currency/suggest` — for Medusa's price editor: from one typed
 * price per row, every other column of the row under the Currencies rules.
 * Writes nothing; the admin reviews the prices and saves them in Medusa's
 * editor. A stale rate table is used (and marked) rather than none.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const body = req.validatedBody as AdminSuggestType
  const settings = await service.getSettings()
  const store = await loadStoreContext(req.scope, settings)
  if (!store.base) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The store has no currencies. Add them in Settings → Store, then choose the base currency on the Currencies page."
    )
  }
  const base = store.base
  const others = store.currencies.filter((currency) => currency.code !== base.code)
  const rules = Object.fromEntries(others.map((currency) => [currency.code, ruleFor(settings, currency.code)]))
  const noTable: RateLookup = { table: null, status: "unavailable", checked_at: null, next_expected: null, error: null }
  const lookup = Object.values(rules).some((rule) => rule.mode !== "fixed") ? await currentRates(req.scope) : null
  const rates = Object.fromEntries(
    others.map((currency) => [
      currency.code,
      resolveRate({
        base: base.code,
        target: currency.code,
        rule: rules[currency.code],
        lookup: lookup ?? noTable,
        allowStale: true,
      }),
    ])
  )

  const context: SuggestContext = {
    base: { code: base.code, decimals: base.decimals },
    currencies: store.currencies.map((currency) => ({ code: currency.code, decimals: currency.decimals })),
    regions: store.regions,
    baseTaxCountry: store.baseTaxCountry,
    taxInclusive: store.taxInclusive,
    taxRates: store.taxRates,
    rules,
    rates,
  }
  res.json({
    base: base.code,
    rows: suggestPrices(context, body.rows),
    rates: lookup
      ? { status: lookup.status, table: lookup.table?.table ?? null, date: lookup.table?.date ?? null }
      : null,
  })
}
