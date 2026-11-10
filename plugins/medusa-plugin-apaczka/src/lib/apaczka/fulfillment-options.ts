import type { ApaczkaService, ApaczkaServiceStructure } from "./client"
import { toArray } from "./client"
import type { ApaczkaPluginOptions } from "./options"

/** Where the parcel starts or ends: a street address or a parcel point. */
export type Endpoint = "door" | "point"

/**
 * What Medusa stores as `shipping_option.data` when an admin picks one of
 * our fulfillment options. Everything the provider needs later is in here,
 * so shipping options keep working even if the service list changes.
 */
export type ApaczkaFulfillmentOption = {
  id: string
  name: string
  service_id: number
  service_name: string
  supplier: string
  /** Cash on delivery variant. */
  cod: boolean
  is_return: boolean
  /** How the parcel reaches the carrier. */
  origin: Endpoint
  /** Where the parcel is delivered. */
  destination: Endpoint
  domestic: boolean
  /** 0 unavailable · 1 available · 2 required. */
  pickup_courier: 0 | 1 | 2
  /** `points/{type}/` type for the storefront point picker. */
  points_type?: string
}

export function fulfillmentOptionId(serviceId: number, variant: "standard" | "cod" | "return"): string {
  return variant === "standard" ? `apaczka-${serviceId}` : `apaczka-${serviceId}-${variant}`
}

/** Builds the list shown in the admin's "Create shipping option" form. */
export function buildFulfillmentOptions(
  structure: ApaczkaServiceStructure,
  options: Pick<
    ApaczkaPluginOptions,
    "enabledServices" | "offerCodVariants" | "offerReturnVariants" | "services" | "pointTypes"
  >
): ApaczkaFulfillmentOption[] {
  const pointTypes = toArray(structure.points_type as Record<string, string> | string[] | undefined).map(String)
  const enabled = new Set(options.enabledServices)

  const services = toArray(structure.services)
    .map((service) => ({ ...service, service_id: Number(service.service_id) }))
    .filter((service) => Number.isFinite(service.service_id))
    .filter((service) => enabled.size === 0 || enabled.has(service.service_id))
    .sort((a, b) => `${a.supplier} ${a.name}`.localeCompare(`${b.supplier} ${b.name}`, "pl"))

  const result: ApaczkaFulfillmentOption[] = []
  for (const service of services) {
    const base = describeService(service, options, pointTypes)
    result.push(base)

    if (options.offerCodVariants) {
      result.push({
        ...base,
        id: fulfillmentOptionId(base.service_id, "cod"),
        name: `${base.name} — COD`,
        cod: true,
      })
    }

    // Returns are sent by the customer to the warehouse, so they only make
    // sense for services that deliver to a street address.
    if (options.offerReturnVariants && base.destination === "door") {
      result.push({
        ...base,
        id: fulfillmentOptionId(base.service_id, "return"),
        name: `${base.name} — return`,
        is_return: true,
      })
    }
  }

  return result
}

export function describeService(
  service: ApaczkaService,
  options: Pick<ApaczkaPluginOptions, "services" | "pointTypes">,
  pointTypes: string[] = []
): ApaczkaFulfillmentOption {
  const serviceId = Number(service.service_id)
  const flag = (key: string) => Number(service[key] ?? 0)

  const toPoint = flag("door_to_point") === 1 || flag("point_to_point") === 1
  const toDoor = flag("door_to_door") === 1 || flag("point_to_door") === 1
  // Sender must use a point only when no door-pickup routing exists.
  const fromPoint =
    (flag("point_to_point") === 1 || flag("point_to_door") === 1) &&
    flag("door_to_door") !== 1 &&
    flag("door_to_point") !== 1
  const supplier = String(service.supplier ?? "").trim()
  const domestic = service.domestic === undefined ? true : flag("domestic") === 1
  const displayName =
    options.services[String(serviceId)]?.name ?? defaultName(String(service.name ?? ""), supplier, domestic)

  return {
    id: fulfillmentOptionId(serviceId, "standard"),
    name: displayName,
    service_id: serviceId,
    service_name: String(service.name ?? ""),
    supplier,
    cod: false,
    is_return: false,
    origin: fromPoint ? "point" : "door",
    // A service that can do both is treated as door delivery; point
    // delivery is chosen per order by sending a `point_id`.
    destination: toPoint && !toDoor ? "point" : "door",
    domestic,
    pickup_courier: clampFlag(flag("pickup_courier")),
    points_type: resolvePointsType(supplier, options.pointTypes, pointTypes),
  }
}

/**
 * Maps a supplier to its `points/{type}/` code: explicit option first, then
 * an exact match in the account's `points_type` list, then a type the
 * supplier code contains (`PP_PACKETA` → `PACKETA`), then a prefix match
 * (`DHL` → `DHL_PARCEL`), then the supplier code itself.
 */
export function resolvePointsType(
  supplier: string,
  configured: Record<string, string>,
  available: string[]
): string | undefined {
  if (!supplier) {
    return undefined
  }
  const upper = supplier.toUpperCase()
  const explicit = configured[supplier] ?? configured[upper]
  if (explicit) {
    return explicit
  }
  const exact = available.find((type) => type.toUpperCase() === upper)
  if (exact) {
    return exact
  }
  const contained = available.find((type) => upper.includes(type.toUpperCase()))
  if (contained) {
    return contained
  }
  const firstWord = upper.split(/[\s_-]+/)[0]
  const prefix = available.find((type) => type.toUpperCase().startsWith(firstWord))
  return prefix ?? upper
}

/** Narrows `shipping_option.data` to our option shape, or returns undefined. */
export function parseFulfillmentOption(data: unknown): ApaczkaFulfillmentOption | undefined {
  if (!data || typeof data !== "object") {
    return undefined
  }
  const candidate = data as Partial<ApaczkaFulfillmentOption>
  const serviceId = Number(candidate.service_id)
  if (!Number.isInteger(serviceId) || typeof candidate.id !== "string" || !candidate.id.startsWith("apaczka-")) {
    return undefined
  }
  return {
    id: candidate.id,
    name: String(candidate.name ?? candidate.id),
    service_id: serviceId,
    service_name: String(candidate.service_name ?? ""),
    supplier: String(candidate.supplier ?? ""),
    cod: Boolean(candidate.cod),
    is_return: Boolean(candidate.is_return),
    origin: candidate.origin === "point" ? "point" : "door",
    destination: candidate.destination === "point" ? "point" : "door",
    domestic: candidate.domestic !== false,
    pickup_courier: clampFlag(Number(candidate.pickup_courier ?? 1)),
    points_type: candidate.points_type,
  }
}

/**
 * Apaczka service names already include the carrier ("DPD Kurier", "InPost
 * Paczkomat"). Some names repeat for domestic and international variants, so
 * those get a suffix.
 */
function defaultName(name: string, supplier: string, domestic: boolean): string {
  const base = name.trim() || supplier
  if (domestic || /zagranic|europ|international|int/i.test(base)) {
    return base
  }
  return `${base} (international)`
}

function clampFlag(value: number): 0 | 1 | 2 {
  return value === 0 ? 0 : value === 2 ? 2 : 1
}
