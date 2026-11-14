import type { CreateCampaignDTO, IPromotionModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep, dismissRemoteLinkStep, emitEventStep } from "@medusajs/medusa/core-flows"

import type { PromotionSpec } from "../../lib/coupons/promotions"
import { COUPONS_MODULE } from "../../modules/coupons"
import {
  couponsCreateCampaignStep,
  couponsCreatePromotionsStep,
  couponsCreateRowStep,
  type CouponRowInput,
  couponsSetStatusStep,
  couponsSoftDeletePromotionsStep,
  couponsSoftDeleteRowStep,
  couponsUpdateCampaignStep,
  couponsUpdatePromotionsStep,
  couponsUpdateRowStep,
} from "./steps"

export * from "./steps"

/** Emitted after a batch of single-use codes is created; `batch_id` is the coupon id. */
export const BATCH_CREATED_EVENT = "bitshaft.coupons.batch_created"

export type CreateCouponWorkflowInput = {
  row: CouponRowInput
  campaign: CreateCampaignDTO
  specs: PromotionSpec[]
}

/**
 * Creates a coupon: its campaign (dates, shared budget), its promotions in
 * the Promotion Module, the coupon row and the links between them. Each step
 * is undone if a later one fails.
 */
export const createCouponsCouponWorkflow = createWorkflow(
  "create-coupons-coupon",
  (input: CreateCouponWorkflowInput) => {
    const campaignId = couponsCreateCampaignStep(input.campaign)
    const promotionIds = couponsCreatePromotionsStep(
      transform({ input, campaignId }, ({ input, campaignId }) => ({ specs: input.specs, campaign_id: campaignId }))
    )
    const row = couponsCreateRowStep(
      transform({ input, campaignId }, ({ input, campaignId }) => ({ ...input.row, campaign_id: campaignId }))
    )
    createRemoteLinkStep(
      transform({ row, promotionIds }, ({ row, promotionIds }) =>
        promotionIds.map((promotionId) => ({
          [COUPONS_MODULE]: { coupons_coupon_id: row.id },
          [Modules.PROMOTION]: { promotion_id: promotionId },
        }))
      )
    )
    when({ input }, ({ input }) => input.row.batch_size != null).then(() => {
      emitEventStep({
        eventName: BATCH_CREATED_EVENT,
        data: transform({ row, input }, ({ row, input }) => ({
          batch_id: row.id,
          coupon_id: row.id,
          prefix: input.row.batch_prefix,
          quantity: input.row.batch_size,
        })),
      })
    })
    return new WorkflowResponse({ id: row.id })
  }
)

export type UpdateCouponWorkflowInput = {
  row: { id: string; name: string | null; exclusive: boolean; draft: CouponRowInput["draft"] }
  campaign: { id: string; starts_at: Date | null; ends_at: Date | null; budget_limit?: number | null } | null
  pairs: Array<{ id: string; spec: PromotionSpec }>
}

/** Changes a coupon in place: its promotions keep their ids and usage counts. */
export const updateCouponsCouponWorkflow = createWorkflow(
  "update-coupons-coupon",
  (input: UpdateCouponWorkflowInput) => {
    couponsUpdatePromotionsStep(transform({ input }, ({ input }) => ({ pairs: input.pairs })))
    when({ input }, ({ input }) => !!input.campaign).then(() => {
      couponsUpdateCampaignStep(transform({ input }, ({ input }) => input.campaign!))
    })
    couponsUpdateRowStep(transform({ input }, ({ input }) => input.row))
    return new WorkflowResponse({ id: input.row.id })
  }
)

/** Pauses or resumes every promotion of a coupon. */
export const setCouponsCouponStatusWorkflow = createWorkflow(
  "set-coupons-coupon-status",
  (input: { promotion_ids: string[]; status: "active" | "inactive" }) => {
    couponsSetStatusStep(transform({ input }, ({ input }) => ({ ids: input.promotion_ids, status: input.status })))
    return new WorkflowResponse(undefined)
  }
)

/** Last step, so nothing after it can fail: a leftover campaign is only logged. */
const couponsDeleteCampaignStep = createStep("coupons-delete-campaign", async (id: string | null, { container }) => {
  if (!id) return new StepResponse(undefined)
  try {
    await container.resolve<IPromotionModuleService>(Modules.PROMOTION).deleteCampaigns([id])
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[coupons] Could not delete campaign ${id}: ${(error as Error).message}`)
  }
  return new StepResponse(undefined)
})

/**
 * Deletes a coupon. Its promotions are soft-deleted, so orders that used
 * them keep their adjustments and codes, and the codes become free again.
 */
export const deleteCouponsCouponWorkflow = createWorkflow(
  "delete-coupons-coupon",
  (input: { id: string; promotion_ids: string[]; campaign_id: string | null }) => {
    couponsSoftDeletePromotionsStep(transform({ input }, ({ input }) => input.promotion_ids))
    dismissRemoteLinkStep(
      transform({ input }, ({ input }) =>
        input.promotion_ids.map((promotionId) => ({
          [COUPONS_MODULE]: { coupons_coupon_id: input.id },
          [Modules.PROMOTION]: { promotion_id: promotionId },
        }))
      )
    )
    couponsSoftDeleteRowStep(transform({ input }, ({ input }) => input.id))
    couponsDeleteCampaignStep(transform({ input }, ({ input }) => input.campaign_id))
    return new WorkflowResponse({ id: input.id })
  }
)
