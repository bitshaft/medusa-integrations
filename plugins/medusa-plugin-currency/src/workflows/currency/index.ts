import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"

import { CurrencyEvents, type PricesFilledPayload } from "../../lib/currency/events"
import { type FillWrite, currencyRecordRunStep, type RunRecord, currencyWritePricesStep } from "./steps"

export { type FillWrite, type RunRecord, type WrittenPrice } from "./steps"

export type FillCurrencyPricesInput = {
  writes: FillWrite[]
  run: RunRecord
  /** Demo mode: record the run, write no price, emit nothing. */
  demo: boolean
}

/**
 * `fill-currency-prices`: writes the prices of a checked preview, records
 * the history, and emits `currency.prices_filled`. A failure removes the
 * prices it created and restores the ones it overwrote.
 */
export const fillCurrencyPricesWorkflow = createWorkflow("fill-currency-prices", (input: FillCurrencyPricesInput) => {
  const { written } = currencyWritePricesStep({ writes: input.writes, demo: input.demo })
  const run = currencyRecordRunStep({ run: input.run, written })

  const payload = transform({ input, written, run }, ({ input, written, run }): PricesFilledPayload => ({
    run_id: run.id,
    actor_id: input.run.actor_id,
    base_currency: input.run.base_currency,
    rates: input.run.rates as PricesFilledPayload["rates"],
    counts: { added: input.run.added, overwritten: input.run.overwritten, skipped: input.run.skipped },
    prices: written.map((write) => ({
      price_id: write.price_id,
      variant_id: write.variant_id,
      product_id: write.product_id,
      currency_code: write.currency_code,
      price_list_id: write.price_list_id,
      region_id: write.region_id,
      action: write.action,
      amount: write.amount,
      previous_amount: write.previous_amount,
      base_amount: write.base_amount,
    })),
  }))

  when({ input }, ({ input }) => !input.demo).then(() => {
    emitEventStep({ eventName: CurrencyEvents.PRICES_FILLED, data: payload })
  })

  return new WorkflowResponse({ run, written })
})
