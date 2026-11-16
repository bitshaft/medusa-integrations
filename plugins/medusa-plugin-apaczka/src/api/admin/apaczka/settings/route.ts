import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveApaczka } from "../../../../lib/apaczka/api/utils"
import { settingsSchema } from "../../../../lib/apaczka/settings"

/** What the Settings tab shows next to the stored settings: the parcel defaults from medusa-config. */
async function view(req: MedusaRequest) {
  const apaczka = resolveApaczka(req)
  const options = await apaczka.getOptions()
  return {
    settings: await apaczka.getSettings(),
    parcel: {
      default_item_weight_kg: options.parcel.defaultItemWeightKg,
      weight_unit: options.parcel.weightUnit,
      packaging_weight_kg: options.parcel.packagingWeightKg,
      min_weight_kg: options.parcel.minWeightKg,
      strategy: options.parcel.strategy,
    },
    shipment_creation: options.shipmentCreation,
  }
}

/** `GET /admin/apaczka/settings` */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await view(req))
}

/** `POST /admin/apaczka/settings` with the whole settings object. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = settingsSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "settings"}: ${i.message}`).join("; ")
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid settings: ${message}`)
  }
  await resolveApaczka(req).saveSettings(parsed.data)
  res.json(await view(req))
}
