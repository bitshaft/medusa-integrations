import type { MedusaContainer } from "@medusajs/framework/types"

import {
  effectiveSafety,
  type EffectiveSafety,
  gpsrGaps,
  type ManufacturerProfile,
  oneLine,
  type ProductSafetyData,
} from "../gpsr"
import { markdownToText, renderMarkdown } from "../markdown"
import type { GpsrGap, Locale, Party, Warnings } from "../types"
import { graph, graphAll, moduleOn, resolveCompliance } from "./runtime"

type Row = Record<string, any>

const party = (value: unknown): Partial<Party> => (value && typeof value === "object" ? (value as Partial<Party>) : {})

export function toProfile(row: Row): ManufacturerProfile {
  return {
    id: row.id,
    name: row.name,
    manufacturer: {
      name: null,
      trade_name: null,
      postal_address: null,
      electronic_address: null,
      ...party(row.manufacturer),
    },
    outside_eu: Boolean(row.outside_eu),
    responsible: {
      name: null,
      trade_name: null,
      postal_address: null,
      electronic_address: null,
      ...party(row.responsible),
    },
  }
}

export function toSafetyData(row: Row | null | undefined): ProductSafetyData | null {
  if (!row) return null
  const id = (row.identification ?? {}) as Row
  return {
    manufacturer_id: row.manufacturer_id ?? null,
    manufacturer: party(row.manufacturer),
    outside_eu: row.outside_eu ?? null,
    responsible: party(row.responsible),
    identification: {
      type: id.type ?? null,
      model: id.model ?? null,
      batch: id.batch ?? null,
      batch_applicable: Boolean(id.batch_applicable),
    },
    label_image_url: row.label_image_url ?? null,
    warnings: (row.warnings ?? {}) as Warnings,
  }
}

/**
 * Checks products and stores the gaps. Products without GPSR data get a row
 * too, so the admin can list them. Publishing is never blocked.
 */
export async function recomputeGpsr(
  container: MedusaContainer,
  productIds?: string[]
): Promise<{ checked: number; incomplete: number }> {
  if (!(await moduleOn(container, "gpsr"))) return { checked: 0, incomplete: 0 }
  const service = resolveCompliance(container)
  const settings = await service.getSettings()
  const products = productIds
    ? (await graph(container)({ entity: "product", fields: ["id", "title", "status"], filters: { id: productIds } }))
        .data
    : await graphAll(container, { entity: "product", fields: ["id", "title", "status"] })

  const ids = products.map((p) => p.id as string)
  const rows = ids.length ? await service.listComplianceProductSafeties({ product_id: ids }) : []
  const byProduct = new Map(rows.map((r) => [r.product_id, r]))
  const profileIds = [...new Set(rows.map((r) => r.manufacturer_id).filter(Boolean) as string[])]
  const profiles = new Map(
    (profileIds.length ? await service.listComplianceManufacturers({ id: profileIds }) : []).map((p) => [
      p.id,
      toProfile(p as Row),
    ])
  )

  const now = new Date()
  const creates: Row[] = []
  const updates: Row[] = []
  let incomplete = 0
  for (const product of products) {
    const row = byProduct.get(product.id) as Row | undefined
    const data = toSafetyData(row)
    const gaps = gpsrGaps(effectiveSafety(data, profiles.get(data?.manufacturer_id ?? "") ?? null), settings.gpsr)
    if (gaps.length) incomplete++
    const result = {
      gaps,
      complete: gaps.length === 0,
      checked_at: now,
      product_title: product.title ?? null,
      product_status: product.status ?? null,
    }
    if (row) updates.push({ id: row.id, ...result })
    else creates.push({ product_id: product.id, ...result })
  }
  if (creates.length) await service.createComplianceProductSafeties(creates)
  if (updates.length) await service.updateComplianceProductSafeties(updates)

  // Rows of deleted products leave the list.
  if (!productIds) {
    const known = new Set(ids)
    const orphans = (await service.listComplianceProductSafeties({}, { select: ["id", "product_id"] })).filter(
      (r) => !known.has(r.product_id)
    )
    if (orphans.length) await service.softDeleteComplianceProductSafeties(orphans.map((r) => r.id))
  }
  return { checked: products.length, incomplete }
}

/** The GPSR data of a product for the admin: stored data, profile, effective result and gaps. */
export async function productSafety(container: MedusaContainer, productId: string) {
  const service = resolveCompliance(container)
  const [row] = await service.listComplianceProductSafeties({ product_id: productId })
  const data = toSafetyData(row as Row)
  const profileRow = data?.manufacturer_id
    ? (await service.listComplianceManufacturers({ id: data.manufacturer_id }))[0]
    : null
  const profile = profileRow ? toProfile(profileRow as Row) : null
  const effective = effectiveSafety(data, profile)
  const settings = await service.getSettings()
  return {
    data,
    profile,
    effective,
    gaps: gpsrGaps(effective, settings.gpsr) as GpsrGap[],
    checked_at: (row as Row | undefined)?.checked_at ?? null,
  }
}

/** Saves the product's GPSR data and checks it at once. */
export async function saveProductSafety(
  container: MedusaContainer,
  productId: string,
  input: Partial<ProductSafetyData>
): Promise<void> {
  const service = resolveCompliance(container)
  const [row] = await service.listComplianceProductSafeties({ product_id: productId })
  const value = {
    manufacturer_id: input.manufacturer_id ?? null,
    manufacturer: input.manufacturer ?? {},
    outside_eu: input.outside_eu ?? null,
    responsible: input.responsible ?? {},
    identification: input.identification ?? null,
    label_image_url: input.label_image_url ?? null,
    warnings: input.warnings ?? {},
  }
  // JSON columns merge on update, so a cleared field would survive; replace the row instead.
  if (row) await service.deleteComplianceProductSafeties(row.id)
  await service.createComplianceProductSafeties({ product_id: productId, ...value } as never)
  await recomputeGpsr(container, [productId])
}

/**
 * GPSR data ready for the product page: plain fields, a one-line address and
 * safe HTML warnings in the requested language, else the store's base
 * language, else any language that has them.
 */
export function storefrontSafety(effective: EffectiveSafety, language: string, fallback: string) {
  const partyView = (p: Party | null) =>
    p
      ? {
          name: p.name,
          trade_name: p.trade_name,
          postal_address: p.postal_address,
          postal_address_line: oneLine(p.postal_address),
          electronic_address: p.electronic_address,
        }
      : null
  const filled = (lang: string) => (effective.warnings[lang]?.trim() ? lang : null)
  const locale =
    filled(language) ?? filled(fallback) ?? Object.keys(effective.warnings).find((lang) => filled(lang)) ?? language
  const warning = effective.warnings[locale] ?? ""
  return {
    manufacturer: partyView(effective.manufacturer),
    responsible_person: partyView(effective.responsible),
    outside_eu: effective.outside_eu,
    identification: {
      type: effective.identification.type,
      model: effective.identification.model,
      batch: effective.identification.batch_applicable ? effective.identification.batch : null,
    },
    label_image_url: effective.label_image_url,
    warnings: { locale, markdown: warning, html: renderMarkdown(warning), text: markdownToText(warning) },
  }
}
