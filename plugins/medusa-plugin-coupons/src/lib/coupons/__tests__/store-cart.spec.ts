import type { MedusaContainer } from "@medusajs/framework/types"

import { loadCart } from "../server/store"

/** A container whose `query.graph` serves these carts by id. */
function containerWith(carts: Array<Record<string, unknown>>) {
  return {
    resolve(key: string) {
      if (key !== "query") throw new Error(`unexpected resolve ${key}`)
      return {
        graph: async ({ filters }: { filters: { id: string } }) => ({
          data: carts.filter((cart) => cart.id === filters.id),
        }),
      }
    },
  } as unknown as MedusaContainer
}

describe("loadCart (Store API)", () => {
  const container = containerWith([
    { id: "cart_anna", customer_id: "cus_anna", customer: { id: "cus_anna", groups: [] } },
    { id: "cart_guest", customer_id: null, customer: null },
  ])

  it("serves a customer's cart to that customer", async () => {
    await expect(loadCart(container, "cart_anna", "cus_anna")).resolves.toMatchObject({ id: "cart_anna" })
  })

  it("answers as missing to anyone else, so the owner's coupon history stays private", async () => {
    await expect(loadCart(container, "cart_anna", "cus_other")).rejects.toThrow(/was not found.*signed in/)
    await expect(loadCart(container, "cart_anna", null)).rejects.toThrow(/was not found/)
  })

  it("keeps guest carts readable by id, as Medusa's own cart route does", async () => {
    await expect(loadCart(container, "cart_guest", null)).resolves.toMatchObject({ id: "cart_guest" })
    await expect(loadCart(container, "cart_guest", "cus_anna")).resolves.toMatchObject({ id: "cart_guest" })
  })

  it("reports a missing cart", async () => {
    await expect(loadCart(container, "cart_none", null)).rejects.toThrow(/cart_none was not found/)
  })
})
