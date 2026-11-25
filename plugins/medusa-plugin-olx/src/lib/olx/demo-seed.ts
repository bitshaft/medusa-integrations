import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { OLX_MODULE } from "../../modules/olx"
import type OlxModuleService from "../../modules/olx/service"
import { loadSampleVariants } from "./catalog"
import { demoOlxId, previewProductId, previewVariantId } from "./demo"
import type { AdvertInput, AdvertRecord, SoldChannel } from "./types"

const DAY = 86_400_000

const FALLBACK_DESCRIPTION =
  "Sample advert from the plugin's demo mode. It shows how an advert looks in the admin and is never sent to OLX."

type Sample = {
  key: string
  status: string
  title: string
  price: string
  validInDays?: number
  sold?: SoldChannel
  error?: string
}

/** One advert in every state the admin can meet, the ones that can still sell first. */
export const DEMO_SAMPLES: Sample[] = [
  { key: "active", status: "active", title: "Wool flannel jacket, size 50", price: "399.00", validInDays: 21 },
  { key: "moderation", status: "new", title: "Oxford cotton shirt, size M", price: "149.00", validInDays: 30 },
  {
    key: "limited",
    status: "limited",
    title: "Cashmere knit sweater, size L",
    price: "289.00",
    error: "Over the free limit of this category. Buy a packet on OLX to activate the advert.",
  },
  { key: "expired", status: "outdated", title: "Wool trousers, size 48 regular", price: "219.00", validInDays: -3 },
  {
    key: "rejected",
    status: "moderated",
    title: "Linen summer blazer, size 52",
    price: "259.00",
    error: "OLX moderation: the description needs correcting.",
  },
  {
    key: "failed",
    status: "failed",
    title: "Tweed overcoat, vintage, size 54",
    price: "699.00",
    error: "category_id: this category does not accept new adverts.",
  },
  { key: "sold-store", status: "removed_by_user", title: "Silk tie, navy, hand rolled", price: "89.00", sold: "store" },
  { key: "sold-olx", status: "removed_by_user", title: "Leather belt, brown, size 95", price: "119.00", sold: "olx" },
]

const fallbackPayload = (sample: Sample): AdvertInput => ({
  title: sample.title,
  description: FALLBACK_DESCRIPTION,
  price: sample.price,
  negotiable: false,
  category_id: 9001,
  attributes: [
    { code: "state", value: "used" },
    { code: "size", value: "m" },
  ],
  images: [],
  city_id: 8001,
  district_id: null,
  contact_name: "Demo store",
  contact_phone: null,
  advertiser_type: "business",
})

/** What a sample looks like once OLX has (or refused) it. */
export function sampleState(sample: Sample, id: string, now: Date): Partial<AdvertRecord> {
  return {
    olx_advert_id: sample.status === "failed" ? null : demoOlxId(id),
    status: sample.status,
    valid_to: sample.validInDays === undefined ? null : new Date(now.getTime() + sample.validInDays * DAY),
    last_error: sample.error ?? null,
    sold_channel: sample.sold ?? null,
    sold_at: sample.sold ? new Date(now.getTime() - 2 * DAY) : null,
    synced_at: now,
  }
}

async function seed(container: MedusaContainer, service: OlxModuleService, now: Date): Promise<number> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const defaults = await service.getDefaults()
  // At most half of the store's variants, so some are left to publish by hand.
  const real = await loadSampleVariants(container, defaults, DEMO_SAMPLES.length)
  let created = 0
  for (const [index, sample] of DEMO_SAMPLES.entries()) {
    const variant = real[index]
    const base = fallbackPayload(sample)
    const payload: AdvertInput = variant
      ? {
          ...base,
          title: variant.draft.title.length >= 16 ? variant.draft.title : `${variant.draft.title} (demo)`,
          description: variant.draft.description.length >= 80 ? variant.draft.description : base.description,
          price: variant.draft.price || base.price,
          images: variant.draft.images,
        }
      : base
    try {
      const row = await service.createRecord({
        variant_id: variant?.variant_id ?? previewVariantId(sample.key),
        product_id: variant?.product_id ?? previewProductId(sample.key),
        payload,
      })
      await service.patchRecord(row.id, sampleState(sample, row.id, now))
      created++
    } catch (error) {
      // Another request seeded this variant a moment ago.
      logger.debug(`[olx] Demo advert ${sample.key} skipped: ${(error as Error).message}`)
    }
  }
  return created
}

let running: Promise<number> | null = null

const once = (run: () => Promise<number>) => {
  running ??= run().finally(() => {
    running = null
  })
  return running
}

/** Fills demo mode with the sample adverts the first time the admin opens it. Never breaks the page. */
export async function ensureDemoAdverts(container: MedusaContainer): Promise<void> {
  const service = container.resolve<OlxModuleService>(OLX_MODULE)
  if (!(await service.getOptions()).demo || (await service.hasDemoAdverts())) {
    return
  }
  try {
    await once(() => seed(container, service, new Date()))
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[olx] Could not add the demo adverts: ${(error as Error).message}`)
  }
}

/** "Restore test data": replaces every demo advert with the sample set. Products and stock stay as they are. */
export async function restoreDemoAdverts(container: MedusaContainer): Promise<number> {
  const service = container.resolve<OlxModuleService>(OLX_MODULE)
  return once(async () => {
    await service.removeDemoAdverts()
    return seed(container, service, new Date())
  })
}
