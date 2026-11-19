import type { MedusaContainer } from "@medusajs/framework/types"

import { loadOrderCoupons } from "../server/query"

/** A container whose Query answers by entity. */
function containerWith(answers: Record<string, unknown[]>) {
  const calls: Array<Record<string, any>> = []
  const query = {
    graph: async (config: Record<string, any>) => {
      calls.push(config)
      return { data: answers[config.entity] ?? [] }
    },
  }
  return { container: { resolve: () => query } as unknown as MedusaContainer, calls }
}

describe("loadOrderCoupons", () => {
  it("sums each code's adjustments over items and shipping and names its coupon", async () => {
    const { container, calls } = containerWith({
      order: [
        {
          id: "order_1",
          currency_code: "pln",
          items: [
            { adjustments: [{ code: "LATO10", amount: 12.5, promotion_id: "promo_1" }] },
            { adjustments: [{ code: "LATO10", amount: 7.25, promotion_id: "promo_1" }, { code: null, amount: 3 }] },
          ],
          shipping_methods: [{ adjustments: [{ code: "VIP-7K2Q", amount: 14.99, promotion_id: "promo_2" }] }],
        },
      ],
      promotion: [
        {
          id: "promo_1",
          code: "LATO10",
          is_automatic: false,
          coupons_coupon: { id: "coup_1", code: "LATO10", name: "Lato", kind: "percentage", batch_size: null },
        },
        {
          id: "promo_2",
          code: "VIP-7K2Q",
          is_automatic: false,
          coupons_coupon: { id: "coup_2", code: "VIP", name: null, kind: "free_shipping", batch_size: 500 },
        },
      ],
    })
    expect(await loadOrderCoupons(container, "order_1")).toEqual({
      currency_code: "pln",
      codes: [
        {
          code: "LATO10",
          promotion_id: "promo_1",
          discount: 19.75,
          automatic: false,
          coupon: { id: "coup_1", code: "LATO10", name: "Lato", kind: "percentage", batch: false },
        },
        {
          code: "VIP-7K2Q",
          promotion_id: "promo_2",
          discount: 14.99,
          automatic: false,
          coupon: { id: "coup_2", code: "VIP", name: null, kind: "free_shipping", batch: true },
        },
      ],
    })
    expect(calls[1]).toMatchObject({ entity: "promotion", filters: { id: ["promo_1", "promo_2"] } })
  })

  it("marks promotions made outside the plugin, and asks nothing more for an order without codes", async () => {
    const outside = containerWith({
      order: [{ id: "o", currency_code: "eur", items: [{ adjustments: [{ code: "BF", amount: 5, promotion_id: "p" }] }] }],
      promotion: [{ id: "p", code: "BF", is_automatic: true }],
    })
    expect((await loadOrderCoupons(outside.container, "o")).codes).toEqual([
      { code: "BF", promotion_id: "p", discount: 5, automatic: true, coupon: null },
    ])

    const none = containerWith({ order: [{ id: "o", currency_code: "pln", items: [{ adjustments: [] }] }] })
    expect(await loadOrderCoupons(none.container, "o")).toEqual({ currency_code: "pln", codes: [] })
    expect(none.calls).toHaveLength(1)
  })
})
