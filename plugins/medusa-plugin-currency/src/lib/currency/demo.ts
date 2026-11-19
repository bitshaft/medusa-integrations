import type { PlanVariant } from "./fill/plan"
import type { RateLookup, RateTable } from "./rates"

/**
 * Demo mode: a sample rate table and sample products, so the whole preview
 * can be tried without asking NBP and without touching a price.
 */

export const DEMO_TABLE: RateTable = {
  provider: "nbp",
  table: "DEMO/A/NBP",
  date: "2026-11-19",
  base: "PLN",
  rates: {
    EUR: "4.2512",
    USD: "3.9204",
    GBP: "4.9876",
    CHF: "4.5321",
    CZK: "0.1703",
    HUF: "0.010812",
    SEK: "0.3712",
    NOK: "0.3601",
    DKK: "0.5701",
    JPY: "0.025713",
  },
}

export function demoLookup(): RateLookup {
  return { table: DEMO_TABLE, status: "demo", checked_at: null, next_expected: null, error: null }
}

/** Amounts are written in the base currency; one variant has no base price, one already has a target price. */
export function demoVariants(base: string, firstTarget: string | null): PlanVariant[] {
  const price = (id: string, amount: string, currency = base) => ({
    id,
    currency,
    amount,
    price_list_id: null,
    region_id: null,
    min_quantity: null,
    max_quantity: null,
    other_rules: false,
  })
  const variant = (
    id: string,
    product: [string, string],
    title: string,
    sku: string,
    prices: PlanVariant["prices"]
  ) => ({
    id,
    title,
    sku,
    product_id: product[0],
    product_title: product[1],
    thumbnail: null,
    price_set_id: `demo_pset_${id}`,
    prices,
  })
  const mug: [string, string] = ["demo_prod_mug", "Kubek ceramiczny"]
  const shirt: [string, string] = ["demo_prod_shirt", "Koszulka bawełniana"]
  const lamp: [string, string] = ["demo_prod_lamp", "Lampka biurkowa"]
  return [
    variant("demo_var_mug_white", mug, "Biały", "MUG-W", [price("demo_price_1", "39.99")]),
    variant("demo_var_mug_black", mug, "Czarny", "MUG-B", [
      price("demo_price_2", "44.99"),
      ...(firstTarget ? [price("demo_price_3", "9.50", firstTarget)] : []),
    ]),
    variant("demo_var_shirt_m", shirt, "M", "TS-M", [price("demo_price_4", "79.00")]),
    variant("demo_var_shirt_l", shirt, "L", "TS-L", [price("demo_price_5", "79.00")]),
    variant("demo_var_lamp", lamp, "Standard", "LAMP-1", []),
  ]
}
