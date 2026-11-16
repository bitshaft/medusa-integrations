import type { ApaczkaParcel } from "./client"
import type { ParcelOptions } from "./options"

/** A line item reduced to what parcel building needs. Units as in the catalog. */
export type ParcelItem = {
  title?: string
  quantity: number
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
}

/** An item counted with the default weight because its variant has none. */
export type MissingWeight = { title: string; quantity: number; variant_id: string | null; product_id: string | null }

/**
 * Items whose variant has no weight. Parcels count each of their units as
 * `defaultItemWeightKg`, which can be far from the truth, so staff are told.
 */
export function missingWeights(
  items: Array<ParcelItem & { variant_id?: string | null; product_id?: string | null }>
): MissingWeight[] {
  return items
    .filter((item) => item.quantity > 0 && !isPositive(item.weight))
    .map((item) => ({
      title: item.title ?? "",
      quantity: item.quantity,
      variant_id: item.variant_id ?? null,
      product_id: item.product_id ?? null,
    }))
}

export type ParcelContext = {
  items: ParcelItem[]
  options: ParcelOptions
  serviceId?: number
  content?: string
}

const WEIGHT_TO_KG: Record<ParcelOptions["weightUnit"], number> = { g: 0.001, kg: 1 }
const DIMENSION_TO_CM: Record<ParcelOptions["dimensionUnit"], number> = { mm: 0.1, cm: 1, m: 100 }

/**
 * Builds Apaczka parcels from line items.
 *
 * - `single`: one parcel. Weight is the sum of all units plus packaging. Uses
 *   the item's own dimensions when there is exactly one unit, otherwise the
 *   default box.
 * - `per_item`: one parcel per unit, each with its own dimensions/weight.
 *
 * For anything smarter (box packing, per-product boxes) pass `buildParcels`
 * in the plugin options.
 */
export function buildParcels(context: ParcelContext): ApaczkaParcel[] {
  const { options } = context
  const units = context.items.flatMap((item) =>
    Array.from({ length: Math.max(0, Math.floor(item.quantity)) }, () => item)
  )

  if (units.length === 0) {
    return [toParcel(options.defaultItemWeightKg, options.defaultDimensionsCm, context)]
  }

  if (options.strategy === "per_item") {
    return units.map((unit) => toParcel(unitWeightKg(unit, options), unitDimensionsCm(unit, options), context))
  }

  const totalKg = units.reduce((sum, unit) => sum + unitWeightKg(unit, options), 0)
  const dimensions = units.length === 1 ? unitDimensionsCm(units[0], options) : options.defaultDimensionsCm
  return [toParcel(totalKg, dimensions, context)]
}

function toParcel(
  weightKg: number,
  dimensions: { length: number; width: number; height: number },
  context: ParcelContext
): ApaczkaParcel {
  const { options } = context
  const weight = Math.max(options.minWeightKg, weightKg + options.packagingWeightKg)
  return {
    shipment_type_code: options.packageType,
    dimension1: ceilCm(dimensions.length),
    dimension2: ceilCm(dimensions.width),
    dimension3: ceilCm(dimensions.height),
    // Round up to 10 g so carriers never see an underweight parcel.
    weight: Math.ceil(weight * 100) / 100,
    is_nstd: options.nonStandard ? 1 : 0,
    ...(context.content ? { content: context.content } : {}),
  }
}

function unitWeightKg(item: ParcelItem, options: ParcelOptions): number {
  return isPositive(item.weight) ? item.weight * WEIGHT_TO_KG[options.weightUnit] : options.defaultItemWeightKg
}

function unitDimensionsCm(item: ParcelItem, options: ParcelOptions) {
  if (isPositive(item.length) && isPositive(item.width) && isPositive(item.height)) {
    const factor = DIMENSION_TO_CM[options.dimensionUnit]
    return { length: item.length * factor, width: item.width * factor, height: item.height * factor }
  }
  return options.defaultDimensionsCm
}

function ceilCm(value: number): number {
  return Math.max(1, Math.ceil(value))
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}
