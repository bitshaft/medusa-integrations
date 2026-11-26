import { z } from "@medusajs/framework/zod"

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM")
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1")

/* Store ------------------------------------------------------------------- */

/** `west,south,east,north` in degrees: the map area to return points for. */
const bbox = z.string().transform((value, ctx) => {
  const parts = value.split(",").map((part) => Number(part.trim()))
  const [west, south, east, north] = parts
  const valid =
    parts.length === 4 &&
    parts.every(Number.isFinite) &&
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  if (!valid) {
    ctx.addIssue({ code: "custom", message: "Use bbox=west,south,east,north in degrees, e.g. 20.9,52.2,21.1,52.3" })
    return z.NEVER
  }
  return { west, south, east, north }
})

export const StorePointsQuery = z.object({
  /** Point type from the shipping option's `data.points_type`, e.g. `INPOST`. */
  type: z.string().min(1).max(40),
  country_code: z.string().length(2).default("pl"),
  q: z.string().max(100).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  bbox: bbox.optional(),
  cod: booleanish.optional(),
  sending: booleanish.optional(),
  /** Up to 500, enough for a city-level map view. */
  limit: z.coerce.number().int().min(1).max(500).default(50),
})
export type StorePointsQuery = z.infer<typeof StorePointsQuery>

export const StorePointClustersQuery = z.object({
  type: z.string().min(1).max(40),
  country_code: z.string().length(2).default("pl"),
  /** The map area to cluster: required, a whole country is a fine area. */
  bbox,
  /** The map's zoom level, in whole steps as web maps use. */
  zoom: z.coerce.number().int().min(0).max(20),
  cod: booleanish.optional(),
  sending: booleanish.optional(),
})
export type StorePointClustersQuery = z.infer<typeof StorePointClustersQuery>

export const StorePointQuery = z.object({
  country_code: z.string().length(2).default("pl"),
})
export type StorePointQuery = z.infer<typeof StorePointQuery>

/* Admin ------------------------------------------------------------------- */

export const AdminSyncPoints = z.object({
  /** Point type, e.g. `INPOST`. */
  type: z.string().min(1).max(40),
  country_code: z.string().length(2).default("pl"),
})
export type AdminSyncPoints = z.infer<typeof AdminSyncPoints>

export const AdminShipmentsQuery = z.object({
  order_id: z.string().optional(),
  fulfillment_id: z.string().optional(),
  status: z.string().optional(),
  /** Searches waybill numbers, Apaczka order IDs and Medusa order IDs. */
  q: z.string().trim().min(1).max(100).optional(),
  is_return: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type AdminShipmentsQuery = z.infer<typeof AdminShipmentsQuery>

export const AdminPickupHoursQuery = z.object({
  postal_code: z.string().min(2),
  service_id: z.coerce.number().int(),
})
export type AdminPickupHoursQuery = z.infer<typeof AdminPickupHoursQuery>

const ParcelOverride = z.object({
  weight: z.number().positive().max(1000),
  length: z.number().positive().max(1000),
  width: z.number().positive().max(1000),
  height: z.number().positive().max(1000),
  package_type: z.string().optional(),
  non_standard: z.boolean().optional(),
})

export const ShipmentOverridesSchema = z.object({
  service_id: z.number().int().optional(),
  parcels: z.array(ParcelOverride).min(1).max(50).optional(),
  pickup: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("SELF") }),
      z.object({ type: z.literal("COURIER"), date, hours_from: time, hours_to: time }),
    ])
    .optional(),
  cod_amount: z.number().nonnegative().optional(),
  declared_value: z.number().nonnegative().optional(),
  point_id: z.string().min(1).optional(),
  options: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  content: z.string().max(255).optional(),
  comment: z.string().max(255).optional(),
})

export const AdminCreateShipment = z.object({
  overrides: ShipmentOverridesSchema.optional(),
})
export type AdminCreateShipment = z.infer<typeof AdminCreateShipment>

export const AdminBookPickup = z.object({
  shipment_ids: z.array(z.string()).min(1).max(100),
  date,
  hour_from: time,
  hour_to: time,
})
export type AdminBookPickup = z.infer<typeof AdminBookPickup>

export const AdminTurnIn = z.object({
  shipment_ids: z.array(z.string()).min(1).max(100),
})
export type AdminTurnIn = z.infer<typeof AdminTurnIn>
