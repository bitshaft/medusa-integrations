import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveEnabled } from "../../../../lib/currency/api/utils"
import type { AdminSampleType } from "../../../../lib/currency/api/validators"
import { currentRates } from "../../../../lib/currency/fill"
import { loadStoreContext } from "../../../../lib/currency/fill/load"
import { convertAmount } from "../../../../lib/currency/money"
import { taxCountryFor } from "../../../../lib/currency/fill/plan"
import { resolveRate } from "../../../../lib/currency/rates"

/**
 * `POST /admin/currency/sample` — what a sample base price (100.00 by
 * default) becomes under a rule being edited, before it is saved.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const body = req.validatedBody as AdminSampleType
  const settings = await service.getSettings()
  const store = await loadStoreContext(req.scope, {
    ...settings,
    ...(body.base_currency !== undefined ? { baseCurrency: body.base_currency?.toLowerCase() ?? null } : {}),
    ...(body.base_tax_country !== undefined ? { baseTaxCountry: body.base_tax_country?.toLowerCase() ?? null } : {}),
  })
  const target = store.currencies.find((currency) => currency.code === body.currency.toLowerCase())
  if (!store.base || !target) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${body.currency.toUpperCase()} is not a currency of this store.`
    )
  }
  const lookup =
    body.rule.mode === "fixed"
      ? { table: null, status: "unavailable" as const, checked_at: null, next_expected: null, error: null }
      : await currentRates(req.scope)
  const rate = resolveRate({ base: store.base.code, target: target.code, rule: body.rule, lookup, allowStale: true })
  if (!rate.ok) return res.json({ amount: body.amount, base: store.base.code, rate: null, reason: rate.reason, lookup })

  const firstRegion = (currency: string) =>
    store.regions.filter((region) => region.currency === currency).sort((a, b) => a.name.localeCompare(b.name))[0]
  const taxCountry = taxCountryFor(body.rule.taxCountry, firstRegion(target.code), false)
  const baseCountry = taxCountryFor(store.baseTaxCountry, firstRegion(store.base.code), false)
  const base = {
    inclusive: store.taxInclusive.currency[store.base.code] ?? false,
    rate: baseCountry ? (store.taxRates[baseCountry] ?? null) : null,
  }
  const targetTax = {
    inclusive: store.taxInclusive.currency[target.code] ?? false,
    rate: taxCountry ? (store.taxRates[taxCountry] ?? null) : null,
  }
  const conversion = convertAmount({
    amount: body.amount,
    rate: rate.rate,
    decimals: target.decimals,
    rounding: body.rule.rounding,
    tax: body.rule.tax,
    base,
    target: targetTax,
  })
  res.json({
    amount: body.amount,
    base: store.base.code,
    rate: rate.rate,
    conversion,
    tax: { base: { ...base, country: baseCountry }, target: { ...targetTax, country: taxCountry ?? null } },
    lookup: body.rule.mode === "fixed" ? null : lookup,
  })
}
