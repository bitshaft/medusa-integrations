/**
 * Events this plugin emits. Other plugins can subscribe by name, without
 * depending on this package.
 */
export const CurrencyEvents = {
  /**
   * A fill was saved (never in demo mode). Payload: `PricesFilledPayload`.
   * A price change listed here comes from an exchange rate, not a promotion.
   */
  PRICES_FILLED: "currency.prices_filled",
} as const

export type PricesFilledPayload = {
  run_id: string
  actor_id: string | null
  base_currency: string
  /** Per target currency: how its rate was set. */
  rates: Record<
    string,
    {
      mode: string
      rate: string
      margin: string
      effective: string
      provider: string | null
      table: string | null
      date: string | null
    }
  >
  counts: { added: number; overwritten: number; skipped: number }
  prices: Array<{
    price_id: string
    variant_id: string
    product_id: string
    currency_code: string
    price_list_id: string | null
    region_id: string | null
    action: "add" | "overwrite"
    amount: string
    previous_amount: string | null
    base_amount: string
  }>
}
