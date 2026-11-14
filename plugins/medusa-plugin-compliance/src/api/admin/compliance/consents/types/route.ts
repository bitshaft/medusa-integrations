import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminActor, isDemo, requireModule } from "../../../../../lib/compliance/api/utils"
import type { AdminConsentType } from "../../../../../lib/compliance/api/validators"
import { LAWYER_PLACEHOLDER } from "../../../../../lib/compliance/settings"
import { loadConsentTypes, saveConsentType } from "../../../../../lib/compliance/server/consents"

/** `GET /admin/compliance/consents/types`: consent types with every version of their text. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "gdpr")
  if (await isDemo(req)) {
    const now = new Date().toISOString()
    const text = { pl: LAWYER_PLACEHOLDER, en: LAWYER_PLACEHOLDER }
    res.json({
      types: [
        {
          key: "terms",
          name: { pl: "Regulamin", en: "Terms" },
          placement: "registration",
          required: true,
          active: true,
          cookie_category: null,
          versions: [
            { version: 2, text, created_at: now },
            { version: 1, text, created_at: now },
          ],
          granted: 812,
        },
        {
          key: "newsletter",
          name: { pl: "Newsletter", en: "Newsletter" },
          placement: "newsletter",
          required: false,
          active: true,
          cookie_category: null,
          versions: [{ version: 1, text, created_at: now }],
          granted: 304,
        },
        {
          key: "cookies.analytics",
          name: { pl: "Cookies analityczne", en: "Analytics cookies" },
          placement: "cookies",
          required: false,
          active: true,
          cookie_category: "analytics",
          versions: [{ version: 1, text, created_at: now }],
          granted: 1290,
        },
      ],
    })
    return
  }
  const { types, versions } = await loadConsentTypes(req.scope)
  const counts = await Promise.all(
    types.map(
      async (t) =>
        (await service.listAndCountComplianceConsentEntries({ type_key: t.key, granted: true }, { take: 1 }))[1]
    )
  )
  res.json({
    types: types.map((t, i) => ({
      ...t,
      versions: versions
        .filter((v) => v.type_key === t.key)
        .sort((a, b) => b.version - a.version)
        .map((v) => ({ version: v.version, text: v.text, created_at: v.created_at })),
      granted: counts[i],
    })),
  })
}

/** `POST /admin/compliance/consents/types`: creates or updates a type; a changed text becomes a new version. */
export async function POST(req: MedusaRequest<AdminConsentType>, res: MedusaResponse) {
  await requireModule(req, "gdpr")
  res.json(await saveConsentType(req.scope, req.validatedBody, adminActor(req)))
}
