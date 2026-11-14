import type { CreateCampaignDTO, IPromotionModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import type { PromotionSpec } from "../../lib/coupons/promotions"
import type { CouponDraft } from "../../lib/coupons/types"
import { COUPONS_MODULE } from "../../modules/coupons"
import type CouponsModuleService from "../../modules/coupons/service"

type Rule = { attribute: string; operator: string; values: string[] }
type RuleSet = { rules: Rule[]; target_rules: Rule[]; buy_rules: Rule[] }

const promotions = (container: { resolve: <T>(key: string) => T }) =>
  container.resolve<IPromotionModuleService>(Modules.PROMOTION)
const coupons = (container: { resolve: <T>(key: string) => T }) =>
  container.resolve<CouponsModuleService>(COUPONS_MODULE)

const CHUNK = 200

/* Create ------------------------------------------------------------------ */

export const couponsCreateCampaignStep = createStep(
  "coupons-create-campaign",
  async (input: CreateCampaignDTO, { container }) => {
    const campaign = await promotions(container).createCampaigns(input)
    return new StepResponse(campaign.id, campaign.id)
  },
  async (id, { container }) => {
    if (id) await promotions(container).deleteCampaigns([id])
  }
)

export const couponsCreatePromotionsStep = createStep(
  "coupons-create-promotions",
  async (input: { specs: PromotionSpec[]; campaign_id: string }, { container }) => {
    const ids: string[] = []
    for (let i = 0; i < input.specs.length; i += CHUNK) {
      const created = await promotions(container).createPromotions(
        input.specs.slice(i, i + CHUNK).map((spec) => ({ ...spec, campaign_id: input.campaign_id }) as never)
      )
      ids.push(...created.map((p) => p.id))
    }
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) await promotions(container).deletePromotions(ids)
  }
)

export type CouponRowInput = {
  code: string
  name: string | null
  kind: CouponDraft["kind"]
  automatic: boolean
  exclusive: boolean
  tiered: boolean
  batch_size: number | null
  batch_prefix: string | null
  draft: CouponDraft
}

export const couponsCreateRowStep = createStep(
  "coupons-create-row",
  async (input: CouponRowInput & { campaign_id: string }, { container }) => {
    const row = await coupons(container).createCouponsCoupons(input as never)
    return new StepResponse(row as { id: string }, row.id)
  },
  async (id, { container }) => {
    if (id) await coupons(container).deleteCouponsCoupons(id)
  }
)

/* Update ------------------------------------------------------------------ */

async function readRules(container: Parameters<typeof promotions>[0], promotionId: string): Promise<RuleSet> {
  const [promotion] = await promotions(container).listPromotions(
    { id: promotionId },
    {
      relations: [
        "rules",
        "rules.values",
        "application_method",
        "application_method.target_rules",
        "application_method.target_rules.values",
        "application_method.buy_rules",
        "application_method.buy_rules.values",
      ],
    }
  )
  const plain = (rules: unknown): Rule[] =>
    ((rules ?? []) as Array<{ attribute: string; operator: string; values?: Array<{ value: string }> }>).map(
      (rule) => ({
        attribute: rule.attribute,
        operator: rule.operator,
        values: (rule.values ?? []).map((v) => v.value),
      })
    )
  return {
    rules: plain(promotion?.rules),
    target_rules: plain(promotion?.application_method?.target_rules),
    buy_rules: plain(promotion?.application_method?.buy_rules),
  }
}

/** Swaps a promotion's rules for new ones (core has no "replace rules" call). */
async function replaceRules(container: Parameters<typeof promotions>[0], promotionId: string, next: RuleSet) {
  const service = promotions(container)
  const [current] = await service.listPromotions(
    { id: promotionId },
    { relations: ["rules", "application_method", "application_method.target_rules", "application_method.buy_rules"] }
  )
  const ids = (rules: unknown) => ((rules ?? []) as Array<{ id: string }>).map((r) => r.id)
  const old = {
    rules: ids(current?.rules),
    target: ids(current?.application_method?.target_rules),
    buy: ids(current?.application_method?.buy_rules),
  }
  if (old.rules.length) await service.removePromotionRules(promotionId, old.rules)
  if (old.target.length) await service.removePromotionTargetRules(promotionId, old.target)
  if (old.buy.length) await service.removePromotionBuyRules(promotionId, old.buy)
  if (next.rules.length) await service.addPromotionRules(promotionId, next.rules as never)
  if (next.target_rules.length) await service.addPromotionTargetRules(promotionId, next.target_rules as never)
  if (next.buy_rules.length) await service.addPromotionBuyRules(promotionId, next.buy_rules as never)
}

type PromotionState = {
  id: string
  limit: number | null
  is_automatic: boolean
  metadata: Record<string, unknown> | null
  application_method: Record<string, unknown>
  ruleSet: RuleSet
}

const APPLICATION_FIELDS = [
  "type",
  "target_type",
  "allocation",
  "value",
  "currency_code",
  "max_quantity",
  "apply_to_quantity",
  "buy_rules_min_quantity",
] as const

async function readState(container: Parameters<typeof promotions>[0], id: string): Promise<PromotionState> {
  const [promotion] = await promotions(container).listPromotions({ id }, { relations: ["application_method"] })
  const method = (promotion?.application_method ?? {}) as Record<string, unknown>
  return {
    id,
    limit: promotion?.limit ?? null,
    is_automatic: !!promotion?.is_automatic,
    metadata: (promotion?.metadata as Record<string, unknown>) ?? null,
    application_method: Object.fromEntries(APPLICATION_FIELDS.map((key) => [key, method[key] ?? undefined])),
    ruleSet: await readRules(container, id),
  }
}

async function writeState(container: Parameters<typeof promotions>[0], state: PromotionState) {
  const method = Object.fromEntries(Object.entries(state.application_method).filter(([, v]) => v !== undefined))
  await promotions(container).updatePromotions({
    id: state.id,
    limit: state.limit,
    is_automatic: state.is_automatic,
    metadata: state.metadata ?? undefined,
    application_method: method,
  } as never)
  await replaceRules(container, state.id, state.ruleSet)
}

const toState = (id: string, spec: PromotionSpec): PromotionState => ({
  id,
  limit: spec.limit,
  is_automatic: spec.is_automatic,
  metadata: spec.metadata as unknown as Record<string, unknown>,
  application_method: {
    type: spec.application_method.type,
    target_type: spec.application_method.target_type,
    allocation: spec.application_method.allocation,
    value: spec.application_method.value,
    currency_code: spec.application_method.currency_code,
    max_quantity: spec.application_method.max_quantity ?? null,
    apply_to_quantity: spec.application_method.apply_to_quantity ?? null,
    buy_rules_min_quantity: spec.application_method.buy_rules_min_quantity ?? null,
  },
  ruleSet: {
    rules: spec.rules,
    target_rules: spec.application_method.target_rules ?? [],
    buy_rules: spec.application_method.buy_rules ?? [],
  },
})

/**
 * Updates existing promotions in place, so their ids, usage counts, campaign
 * budget usage and order history stay. The previous state is restored if a
 * later step fails.
 */
export const couponsUpdatePromotionsStep = createStep(
  "coupons-update-promotions",
  async (input: { pairs: Array<{ id: string; spec: PromotionSpec }> }, { container }) => {
    const before: PromotionState[] = []
    for (const { id, spec } of input.pairs) {
      before.push(await readState(container, id))
      await writeState(container, toState(id, spec))
    }
    return new StepResponse(undefined, before)
  },
  async (before, { container }) => {
    for (const state of before ?? []) await writeState(container, state)
  }
)

type CampaignUpdate = { id: string; starts_at: Date | null; ends_at: Date | null; budget_limit?: number | null }

export const couponsUpdateCampaignStep = createStep(
  "coupons-update-campaign",
  async (input: CampaignUpdate, { container }) => {
    const service = promotions(container)
    const [current] = await service.listCampaigns({ id: [input.id] }, { relations: ["budget"] })
    const previous: CampaignUpdate = {
      id: input.id,
      starts_at: current?.starts_at ? new Date(current.starts_at) : null,
      ends_at: current?.ends_at ? new Date(current.ends_at) : null,
      budget_limit: current?.budget ? ((current.budget.limit as number | null) ?? null) : undefined,
    }
    await service.updateCampaigns({
      id: input.id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      ...(input.budget_limit !== undefined && current?.budget ? { budget: { limit: input.budget_limit } } : {}),
    })
    return new StepResponse(undefined, previous)
  },
  async (previous, { container }) => {
    if (!previous) return
    await promotions(container).updateCampaigns({
      id: previous.id,
      starts_at: previous.starts_at,
      ends_at: previous.ends_at,
      ...(previous.budget_limit !== undefined ? { budget: { limit: previous.budget_limit } } : {}),
    })
  }
)

export const couponsUpdateRowStep = createStep(
  "coupons-update-row",
  async (input: { id: string; name: string | null; exclusive: boolean; draft: CouponDraft }, { container }) => {
    const [current] = await coupons(container).listCouponsCoupons({ id: input.id })
    await coupons(container).updateCouponsCoupons(input as never)
    return new StepResponse(
      undefined,
      current ? { id: current.id, name: current.name, exclusive: current.exclusive, draft: current.draft } : null
    )
  },
  async (previous, { container }) => {
    if (previous) await coupons(container).updateCouponsCoupons(previous as never)
  }
)

/* Status and delete ------------------------------------------------------- */

export const couponsSetStatusStep = createStep(
  "coupons-set-status",
  async (input: { ids: string[]; status: "active" | "inactive" }, { container }) => {
    const service = promotions(container)
    const current = await service.listPromotions({ id: input.ids }, { select: ["id", "status"] })
    for (let i = 0; i < input.ids.length; i += CHUNK) {
      await service.updatePromotions(input.ids.slice(i, i + CHUNK).map((id) => ({ id, status: input.status })))
    }
    return new StepResponse(
      undefined,
      current.map((p) => ({ id: p.id, status: p.status }))
    )
  },
  async (previous, { container }) => {
    if (previous?.length) await promotions(container).updatePromotions(previous as never)
  }
)

export const couponsSoftDeletePromotionsStep = createStep(
  "coupons-soft-delete-promotions",
  async (ids: string[], { container }) => {
    if (ids.length) await promotions(container).softDeletePromotions(ids)
    return new StepResponse(undefined, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) await promotions(container).restorePromotions(ids)
  }
)

export const couponsSoftDeleteRowStep = createStep(
  "coupons-soft-delete-row",
  async (id: string, { container }) => {
    await coupons(container).softDeleteCouponsCoupons(id)
    return new StepResponse(undefined, id)
  },
  async (id, { container }) => {
    if (id) await coupons(container).restoreCouponsCoupons(id)
  }
)
