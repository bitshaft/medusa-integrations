import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../lib/loyalty/api/utils"
import { graph } from "../../../../lib/loyalty/server/runtime"
import { tierById } from "../../../../lib/loyalty/server/tiers"

/** `GET /admin/loyalty/customers?q=anna` — customers with an account: balance, tier, last activity. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const settings = await service.getSettings()
  const { q, offset, limit } = req.validatedQuery as { q?: string; offset: number; limit: number }
  const { data, metadata } = await graph(req.scope)({
    entity: "customer",
    fields: ["id", "email", "first_name", "last_name", "created_at", "groups.id"],
    filters: { has_account: true, ...(q ? { q } : {}) },
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })
  const ids = data.map((c) => c.id as string)
  const accounts = ids.length ? await service.listLoyaltyAccounts({ customer_id: ids }) : []
  const byCustomer = new Map(accounts.map((a) => [a.customer_id, a]))
  res.json({
    customers: data.map((c) => {
      const account = byCustomer.get(c.id)
      const tier = tierById(settings, account?.tier_id)
      const groups = ((c.groups ?? []) as Array<{ id: string } | null>).filter(Boolean).map((g) => g!.id)
      return {
        id: c.id,
        email: c.email,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
        balance: Number(account?.balance ?? 0),
        tier: tier ? { id: tier.id, name: tier.name } : null,
        last_activity_at: account?.last_activity_at ?? null,
        excluded: groups.some((g) => settings.excluded_group_ids.includes(g)),
      }
    }),
    count: metadata?.count ?? data.length,
    offset,
    limit,
  })
}
