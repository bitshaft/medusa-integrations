import path from "node:path"

import type { IPromotionModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { rewardCode, rewardPromotion, type RewardSnapshot } from "../../src/workflows/loyalty/steps"

jest.setTimeout(120_000)

/**
 * A reward code as the plugin creates it, evaluated by the real Promotion
 * Module: it discounts only its owner's cart, once, by the right amount.
 */
const reward = (overrides: Partial<RewardSnapshot> = {}): RewardSnapshot => ({
  id: "lrew_1",
  name: "Rabat",
  kind: "fixed",
  cost: 500,
  value: 20,
  currency_code: "pln",
  per_customer_limit: null,
  code_valid_days: 30,
  variant_id: null,
  ...overrides,
})

moduleIntegrationTestRunner<IPromotionModuleService>({
  moduleName: Modules.PROMOTION,
  resolve: path.dirname(require.resolve("@medusajs/promotion/package.json")),
  testSuite: ({ service }) => {
    async function create(r: RewardSnapshot, customer = "cus_anna", endsInDays = 30) {
      const code = rewardCode()
      const campaign = await service.createCampaigns({
        name: "Loyalty test",
        campaign_identifier: `loyalty-${code}`,
        starts_at: new Date(Date.now() - 1000),
        ends_at: new Date(Date.now() + endsInDays * 86_400_000),
      })
      const [promotion] = await service.createPromotions([
        {
          ...rewardPromotion({ code, customer_id: customer, redemption_id: "lred_1", reward: r }),
          campaign_id: campaign.id,
        },
      ] as never)
      return { code, promotion }
    }

    async function discount(code: string, customer: string | null) {
      const actions = await service.computeActions([code], {
        currency_code: "pln",
        customer: customer ? { id: customer } : undefined,
        items: [
          {
            id: "i1",
            quantity: 1,
            subtotal: 200,
            original_total: 246,
            total: 246,
            is_discountable: true,
            product: { id: "p1" },
          },
        ],
        shipping_methods: [{ id: "s1", subtotal: 15, original_total: 15, total: 15 }],
      } as never)
      return (actions as Array<{ action: string; amount?: unknown }>)
        .filter((a) => a.action.startsWith("add"))
        .reduce((sum, a) => sum + Number(a.amount), 0)
    }

    it("makes codes in the LOY- format", () => {
      expect(rewardCode()).toMatch(/^LOY-[A-HJ-NP-Z2-9]{8}$/)
    })

    it("discounts only the customer the code was made for", async () => {
      const { code } = await create(reward())
      expect(await discount(code, "cus_anna")).toBe(20)
      expect(await discount(code, "cus_other")).toBe(0)
      expect(await discount(code, null)).toBe(0)
    })

    it("works once", async () => {
      const { code, promotion } = await create(reward())
      await service.updatePromotions({ id: promotion.id, used: 1 } as never)
      expect(await discount(code, "cus_anna")).toBe(0)
    })

    it("gives a percentage off the items, or free shipping", async () => {
      const percent = await create(reward({ kind: "percentage", value: 10 }))
      expect(await discount(percent.code, "cus_anna")).toBeCloseTo(24.6, 2)
      const shipping = await create(reward({ kind: "free_shipping", value: null }))
      expect(await discount(shipping.code, "cus_anna")).toBe(15)
    })

    it("stops working after its end date", async () => {
      const { code } = await create(reward(), "cus_anna", -1)
      expect(await discount(code, "cus_anna")).toBe(0)
    })
  },
})
