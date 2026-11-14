import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireModule } from "../../../../lib/compliance/api/utils"
import type { AdminManufacturer } from "../../../../lib/compliance/api/validators"

/** `GET /admin/compliance/manufacturers`: profiles with the number of products using each. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "gpsr")
  if (await isDemo(req)) {
    res.json({
      manufacturers: [
        {
          id: "demo_mfr_1",
          name: "Acme",
          manufacturer: {
            name: "Acme Sp. z o.o.",
            trade_name: "ACME",
            postal_address: "ul. Przykładowa 1\n00-001 Warszawa",
            electronic_address: "bezpieczenstwo@example.com",
          },
          outside_eu: false,
          responsible: {},
          products: 2,
        },
        {
          id: "demo_mfr_2",
          name: "Shenzhen Toys",
          manufacturer: {
            name: "Shenzhen Toys Co., Ltd.",
            postal_address: "Shenzhen, CN",
            electronic_address: "info@example.cn",
          },
          outside_eu: true,
          responsible: {},
          products: 1,
        },
      ],
    })
    return
  }
  const manufacturers = await service.listComplianceManufacturers({}, { order: { name: "ASC" } })
  const used = await service.listComplianceProductSafeties({}, { select: ["manufacturer_id"] })
  const counts = new Map<string, number>()
  for (const row of used)
    if (row.manufacturer_id) counts.set(row.manufacturer_id, (counts.get(row.manufacturer_id) ?? 0) + 1)
  res.json({ manufacturers: manufacturers.map((m) => ({ ...m, products: counts.get(m.id) ?? 0 })) })
}

/** `POST /admin/compliance/manufacturers`: a new profile. */
export async function POST(req: MedusaRequest<AdminManufacturer>, res: MedusaResponse) {
  const service = await requireModule(req, "gpsr")
  const manufacturer = await service.createComplianceManufacturers(req.validatedBody as never)
  res.status(201).json({ manufacturer })
}
