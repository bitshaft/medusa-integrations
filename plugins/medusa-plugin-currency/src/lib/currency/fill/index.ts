import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import { fillCurrencyPricesWorkflow, type FillWrite } from "../../../workflows/currency"
import { demoLookup, demoVariants } from "../demo"
import { readPackageVersion } from "../kit/package-info"
import { PACKAGE_NAME } from "../options"
import { createRateProvider, lookupRates, type RateLookup, resolveRate } from "../rates"
import { type CurrencyRule, ruleFor } from "../settings"
import { resolveCurrency } from "../runtime"
import { type FillScope, loadStoreContext, loadVariants, productIdsOf, type StoreContext } from "./load"
import { computePlan, type Plan, type PlanTarget } from "./plan"

export { type FillScope } from "./load"

export type FillRequest = {
  scope: FillScope
  /** Target currencies; empty or missing: every enabled one. */
  currencies?: string[]
  overwrite: boolean
  price_lists: boolean
  region_prices: boolean
  /** Use the last saved table when the rate source does not answer. */
  allow_stale: boolean
}

export type Preview = {
  demo: boolean
  base: StoreContext["base"]
  targets: Array<{ code: string; decimals: number; rule: CurrencyRule; rate: PlanTarget["rate"] }>
  /** The rate table used; null when every chosen currency has a fixed rate. */
  rates: RateLookup | null
  plan: Plan
}

/** The rate table for a fill (or the settings page): the demo table in demo mode, else the cache or the source. */
export async function currentRates(container: MedusaContainer, refresh = false): Promise<RateLookup> {
  const service = resolveCurrency(container)
  const options = await service.getOptions()
  if (options.demo) return demoLookup()
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const provider = createRateProvider(options, logger, readPackageVersion(PACKAGE_NAME, __dirname))
  return lookupRates({ provider, store: service, refresh })
}

export async function buildPreview(container: MedusaContainer, request: FillRequest): Promise<Preview> {
  const service = resolveCurrency(container)
  const options = await service.getOptions()
  const settings = await service.getSettings()
  const context = await loadStoreContext(container, settings)
  if (!context.base) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The store has no currencies. Add them in Settings → Store, then choose the base currency on the Currencies page."
    )
  }
  const base = context.base
  const wanted = new Set((request.currencies ?? []).map((code) => code.toLowerCase()))
  const chosen = context.currencies.filter(
    (currency) =>
      currency.code !== base.code &&
      ruleFor(settings, currency.code).enabled &&
      (!wanted.size || wanted.has(currency.code))
  )
  if (!chosen.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "No currency to fill: the store has no other currency, or all of them are switched off on the Currencies page."
    )
  }

  const needsTable = chosen.some((currency) => ruleFor(settings, currency.code).mode !== "fixed")
  const rates = needsTable ? await currentRates(container) : null
  const noTable: RateLookup = { table: null, status: "unavailable", checked_at: null, next_expected: null, error: null }
  const targets = chosen.map((currency) => {
    const rule = ruleFor(settings, currency.code)
    return {
      code: currency.code,
      decimals: currency.decimals,
      rule,
      rate: resolveRate({
        base: base.code,
        target: currency.code,
        rule,
        lookup: rates ?? noTable,
        allowStale: request.allow_stale,
      }),
    }
  })

  let variants
  let priceLists: Record<string, { title: string; status: string }> = {}
  if (request.scope.kind === "demo") {
    if (!options.demo) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Sample products exist only in demo mode.")
    }
    variants = demoVariants(base.code, chosen[0]?.code ?? null)
  } else {
    const productIds = await productIdsOf(container, request.scope)
    ;({ variants, priceLists } = await loadVariants(container, productIds, options.maxVariants))
  }

  const targetCodes = new Set(chosen.map((currency) => currency.code))
  const priceIds = variants.flatMap((variant) =>
    variant.prices.filter((price) => targetCodes.has(price.currency)).map((price) => price.id)
  )
  const records = await service.filledFor(priceIds)
  const filled = Object.fromEntries(
    Object.entries(records).map(([id, record]) => [
      id,
      {
        amount: record.amount,
        run_id: record.run_id,
        created_at: record.created_at.toISOString(),
        rate: record.rate,
        table: record.table_no,
      },
    ])
  )

  const plan = computePlan({
    base: { code: base.code, decimals: base.decimals },
    baseTaxCountry: context.baseTaxCountry,
    targets,
    variants,
    regions: context.regions,
    priceLists,
    taxInclusive: context.taxInclusive,
    taxRates: context.taxRates,
    filled,
    options: { overwrite: request.overwrite, priceLists: request.price_lists, regionPrices: request.region_prices },
  })
  return { demo: options.demo, base, targets, rates, plan }
}

export type ApplyResult =
  | { status: "saved"; run_id: string; demo: boolean; counts: Plan["counts"]; preview: Preview }
  | { status: "changed"; preview: Preview }

/**
 * Saves exactly what a preview showed. The preview is computed again; when
 * any base price, current price, rate or decision differs from the one the
 * admin saw (`fingerprint`), nothing is written and the new preview comes
 * back instead.
 */
export async function applyFill(
  container: MedusaContainer,
  request: FillRequest & { fingerprint: string; confirm_overwrite?: boolean },
  actorId: string | null
): Promise<ApplyResult> {
  const preview = await buildPreview(container, request)
  if (preview.plan.fingerprint !== request.fingerprint) {
    return { status: "changed", preview }
  }
  const rows = preview.plan.rows.filter((row) => row.action !== "skip")
  if (!rows.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Nothing to save: every price in the preview is skipped.")
  }
  if (rows.some((row) => row.action === "overwrite") && !request.confirm_overwrite) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This save replaces prices that are already set. Confirm overwriting (confirm_overwrite: true) to go ahead."
    )
  }

  const writes: FillWrite[] = rows.map((row) => ({
    key: row.key,
    action: row.action as "add" | "overwrite",
    variant_id: row.variant_id,
    product_id: row.product_id,
    price_set_id: row.price_set_id!,
    currency_code: row.currency,
    price_list_id: row.price_list_id,
    region_id: row.region_id,
    min_quantity: row.min_quantity,
    max_quantity: row.max_quantity,
    price_id: row.action === "overwrite" ? (row.current?.id ?? null) : null,
    previous_amount: row.current?.amount ?? null,
    amount: row.new_amount!,
    base_amount: row.base_amount!,
    mode: row.rate!.mode,
    rate: row.rate!.rate,
    margin: row.rate!.margin,
    table_no: row.rate!.source?.table ?? null,
    rate_date: row.rate!.source?.date ?? null,
  }))

  const skippedBy: Record<string, number> = {}
  for (const row of preview.plan.rows) if (row.reason) skippedBy[row.reason] = (skippedBy[row.reason] ?? 0) + 1
  const products = new Map<string, string>()
  for (const row of rows) if (products.size < 50) products.set(row.product_id, row.product_title)

  const rates = Object.fromEntries(
    preview.targets
      .filter((target) => target.rate.ok && rows.some((row) => row.currency === target.code))
      .map((target) => {
        const rate = (target.rate as Extract<PlanTarget["rate"], { ok: true }>).rate
        return [
          target.code,
          {
            mode: rate.mode,
            rate: rate.rate,
            margin: rate.margin,
            effective: rate.effective,
            provider: rate.source?.provider ?? null,
            table: rate.source?.table ?? null,
            date: rate.source?.date ?? null,
            stale: rate.source?.stale ?? false,
            rounding: target.rule.rounding,
            tax: target.rule.tax,
          },
        ]
      })
  )

  const { result } = await fillCurrencyPricesWorkflow(container).run({
    input: {
      writes,
      demo: preview.demo,
      run: {
        actor_id: actorId,
        actor_name: await actorName(container, actorId),
        demo: preview.demo,
        base_currency: preview.base!.code,
        scope: { ...request.scope, labels: [...products.values()].slice(0, 5) } as Record<string, unknown>,
        run_options: {
          overwrite: request.overwrite,
          price_lists: request.price_lists,
          region_prices: request.region_prices,
          currencies: preview.targets.map((target) => target.code),
        },
        rates,
        added: preview.plan.counts.add,
        overwritten: preview.plan.counts.overwrite,
        skipped: preview.plan.counts.skip,
        skipped_by: skippedBy,
        products: [...products].map(([id, title]) => ({ id, title })),
      },
    },
  })
  return { status: "saved", run_id: result.run.id, demo: preview.demo, counts: preview.plan.counts, preview }
}

async function actorName(container: MedusaContainer, actorId: string | null): Promise<string | null> {
  if (!actorId) return null
  try {
    const user = await container.resolve(Modules.USER).retrieveUser(actorId)
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ")
    return name || user.email || null
  } catch {
    return null
  }
}
