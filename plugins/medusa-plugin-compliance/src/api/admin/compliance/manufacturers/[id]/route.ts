import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { requireModule } from "../../../../../lib/compliance/api/utils"
import type { AdminManufacturer } from "../../../../../lib/compliance/api/validators"
import { recomputeGpsr } from "../../../../../lib/compliance/server/gpsr"

/** `POST /admin/compliance/manufacturers/:id`: updates a profile and re-checks the products using it. */
export async function POST(req: MedusaRequest<AdminManufacturer>, res: MedusaResponse) {
  const service = await requireModule(req, "gpsr")
  const [existing] = await service.listComplianceManufacturers({ id: req.params.id })
  if (!existing) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Manufacturer ${req.params.id} was not found.`)
  // JSON columns merge on update; replace the objects in full.
  await service.updateComplianceManufacturers({ id: req.params.id, ...req.validatedBody } as never)
  const products = await service.listComplianceProductSafeties(
    { manufacturer_id: req.params.id },
    { select: ["product_id"] }
  )
  if (products.length)
    await recomputeGpsr(
      req.scope,
      products.map((p) => p.product_id)
    )
  const [manufacturer] = await service.listComplianceManufacturers({ id: req.params.id })
  res.json({ manufacturer })
}

/** `DELETE /admin/compliance/manufacturers/:id`: only when no product uses it. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "gpsr")
  const products = await service.listComplianceProductSafeties({ manufacturer_id: req.params.id }, { take: 1 })
  if (products.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Products still use this manufacturer profile. Move them to another profile first."
    )
  }
  await service.deleteComplianceManufacturers(req.params.id)
  res.json({ id: req.params.id, deleted: true })
}
