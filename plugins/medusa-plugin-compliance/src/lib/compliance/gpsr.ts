import type { ComplianceSettings } from "./settings"
import { type GpsrGap, type Locale, type Party, PARTY_FIELDS, type Warnings } from "./types"

/** A manufacturer profile: written once, attached to many products. */
export type ManufacturerProfile = {
  id: string
  name: string
  manufacturer: Party
  outside_eu: boolean
  responsible: Party
}

/** GPSR data saved on a product. Party fields left empty fall back to the profile. */
export type ProductSafetyData = {
  manufacturer_id: string | null
  manufacturer: Partial<Party>
  /** null: use the profile's value. */
  outside_eu: boolean | null
  responsible: Partial<Party>
  identification: { type: string | null; model: string | null; batch: string | null; batch_applicable: boolean }
  label_image_url: string | null
  warnings: Warnings
}

/** What the store shows: the profile with the product's overrides applied. */
export type EffectiveSafety = {
  manufacturer: Party
  outside_eu: boolean
  responsible: Party | null
  identification: ProductSafetyData["identification"]
  label_image_url: string | null
  warnings: Warnings
  profile: { id: string; name: string } | null
}

const blank = (value: unknown) => typeof value !== "string" || value.trim() === ""

const emptyParty = (): Party => ({ name: null, trade_name: null, postal_address: null, electronic_address: null })

function mergeParty(profile: Party | undefined, override: Partial<Party> | undefined): Party {
  const result = emptyParty()
  for (const field of PARTY_FIELDS) {
    const own = override?.[field]
    result[field] = !blank(own) ? own!.trim() : !blank(profile?.[field]) ? profile![field]!.trim() : null
  }
  return result
}

export function effectiveSafety(data: ProductSafetyData | null, profile: ManufacturerProfile | null): EffectiveSafety {
  const outsideEu = data?.outside_eu ?? profile?.outside_eu ?? false
  return {
    manufacturer: mergeParty(profile?.manufacturer, data?.manufacturer),
    outside_eu: outsideEu,
    responsible: outsideEu ? mergeParty(profile?.responsible, data?.responsible) : null,
    identification: data?.identification ?? { type: null, model: null, batch: null, batch_applicable: false },
    label_image_url: data?.label_image_url ?? null,
    warnings: data?.warnings ?? {},
    profile: profile ? { id: profile.id, name: profile.name } : null,
  }
}

/**
 * Missing GPSR data on a product. Always required: manufacturer name,
 * postal and electronic address; the same for the responsible person when
 * the manufacturer is outside the EU; the batch or serial number when the
 * product says it applies. The rest follows the settings.
 */
export function gpsrGaps(safety: EffectiveSafety, require: ComplianceSettings["gpsr"]): GpsrGap[] {
  const gaps: GpsrGap[] = []
  const party = (prefix: "manufacturer" | "responsible", value: Party | null) => {
    if (blank(value?.name)) gaps.push(`${prefix}.name`)
    if (require.require.manufacturer_trade_name && blank(value?.trade_name)) gaps.push(`${prefix}.trade_name`)
    if (blank(value?.postal_address)) gaps.push(`${prefix}.postal_address`)
    if (blank(value?.electronic_address)) gaps.push(`${prefix}.electronic_address`)
  }
  party("manufacturer", safety.manufacturer)
  if (safety.outside_eu) party("responsible", safety.responsible)

  const id = safety.identification
  if (require.require.identification_type && blank(id.type)) gaps.push("identification.type")
  if (require.require.identification_model && blank(id.model)) gaps.push("identification.model")
  if (id.batch_applicable && blank(id.batch)) gaps.push("identification.batch")
  if (require.require.label_image && blank(safety.label_image_url)) gaps.push("label_image")
  if (require.require.warnings) {
    for (const lang of require.warning_languages) {
      if (blank(safety.warnings[lang as Locale])) gaps.push(`warnings.${lang as Locale}`)
    }
  }
  return gaps
}

/** Readable one-line address: keeps line breaks typed by the team as ", ". */
export function oneLine(value: string | null): string | null {
  return value ? value.replace(/\s*\n\s*/g, ", ").trim() : null
}
