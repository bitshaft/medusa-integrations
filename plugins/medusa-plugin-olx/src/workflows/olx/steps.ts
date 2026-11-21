import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { clearVariantStock, type LevelSnapshot, restoreStock } from "../../lib/olx/catalog"
import type { AdvertRecord } from "../../lib/olx/types"
import { OLX_MODULE } from "../../modules/olx"
import type OlxModuleService from "../../modules/olx/service"

/** Sets the variant's free stock to zero. In demo mode the store's stock is left alone. */
export const olxClearStockStep = createStep(
  "olx-clear-stock",
  async (input: { variant_id: string }, { container }) => {
    const service = container.resolve<OlxModuleService>(OLX_MODULE)
    if ((await service.getOptions()).demo) {
      return new StepResponse({ cleared: 0 }, [] as LevelSnapshot[])
    }
    const levels = await clearVariantStock(container, input.variant_id)
    return new StepResponse({ cleared: levels.length }, levels)
  },
  async (levels, { container }) => {
    if (levels?.length) {
      await restoreStock(container, levels)
    }
  }
)

type SoldFields = Pick<AdvertRecord, "pending_deactivate" | "pending_success" | "sold_channel" | "sold_at">

/** Records the sale and the need to take the advert down; the sync job repeats that until OLX confirms. */
export const olxMarkSoldStep = createStep(
  "olx-mark-sold",
  async (input: { advert_id: string }, { container }) => {
    const service = container.resolve<OlxModuleService>(OLX_MODULE)
    const before = await service.getRecord(input.advert_id)
    if (!before) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `OLX advert ${input.advert_id} does not exist.`)
    }
    const advert = await service.patchRecord(input.advert_id, {
      pending_deactivate: true,
      pending_success: true,
      sold_channel: "olx",
      sold_at: new Date(),
    })
    const previous: SoldFields = {
      pending_deactivate: before.pending_deactivate,
      pending_success: before.pending_success,
      sold_channel: before.sold_channel,
      sold_at: before.sold_at,
    }
    return new StepResponse(advert, { id: input.advert_id, previous })
  },
  async (saved, { container }) => {
    if (saved) {
      await container.resolve<OlxModuleService>(OLX_MODULE).patchRecord(saved.id, saved.previous)
    }
  }
)
