import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { requireEnabled } from "../../../../lib/compliance/api/utils"
import { readPackageVersion } from "../../../../lib/compliance/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/compliance/options"
import { requiredWarningLanguages } from "../../../../lib/compliance/gpsr"
import { LAWYER_PLACEHOLDER, settingsSchema } from "../../../../lib/compliance/settings"
import { graph, resolveCompliance } from "../../../../lib/compliance/server/runtime"
import { storeLanguages } from "../../../../lib/compliance/server/languages"
import { recordPrices } from "../../../../lib/compliance/server/prices"

async function view(req: MedusaRequest) {
  const service = resolveCompliance(req.scope)
  const enabled = await service.isEnabled()
  const { data: regions } = await graph(req.scope)({ entity: "region", fields: ["id", "name", "countries.iso_2"] })
  return {
    enabled,
    disabled_reason: await service.disabledReason(),
    version: readPackageVersion(PACKAGE_NAME, __dirname),
    settings: await service.getSettings(),
    options: {
      ...(await service.getOptions()),
      dataProviders: (await service.getOptions()).dataProviders.map((p) => p.label ?? p.module),
    },
    omnibus_started_at: (await service.omnibusStartedAt())?.toISOString() ?? null,
    regions: regions.map((r) => ({
      id: r.id,
      name: r.name,
      countries: (r.countries ?? []).filter(Boolean).map((c: { iso_2: string }) => c.iso_2),
    })),
    lawyer_placeholder: LAWYER_PLACEHOLDER,
    /** The store's languages (ISO 639), the plugin's default first: warnings can be written in each. */
    store_languages: await storeLanguages(req.scope, (await service.getOptions()).defaultLocale),
  }
}

/** `GET /admin/compliance/settings` */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await view(req))
}

/**
 * `POST /admin/compliance/settings` with the whole settings object. The
 * only change allowed in demo mode, so demo mode can be switched off.
 * Switching Omnibus on for the first time takes the price snapshot.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const parsed = settingsSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("; ")
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid settings: ${message}`)
  }
  // Warnings can be required only in the store's languages; others are dropped.
  try {
    const languages = await storeLanguages(req.scope, (await service.getOptions()).defaultLocale, { strict: true })
    parsed.data.gpsr.warning_languages = requiredWarningLanguages(parsed.data.gpsr.warning_languages, languages)
  } catch {
    // The store's languages couldn't be read: keep the list as sent rather than guess.
  }
  const before = await service.getSettings()
  await service.saveSettings(parsed.data)
  if (parsed.data.modules.omnibus && !before.modules.omnibus && !(await service.omnibusStartedAt())) {
    await recordPrices(req.scope, { source: "snapshot" })
  }
  res.json(await view(req))
}
