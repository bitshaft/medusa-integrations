import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import type { ApaczkaNotificationSettings, ApaczkaOrderInput, ApaczkaParcel } from "./apaczka"
import type { ParcelContext } from "./parcels"

/* ------------------------------------------------------------------------ */
/* Schema                                                                    */
/* ------------------------------------------------------------------------ */

const fn = <T>() => z.custom<T>((value) => typeof value === "function", "Expected a function")

const senderSchema = z.object({
  /** Company or person name printed on the label. */
  name: z.string().min(1).optional(),
  contactPerson: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  line1: z.string().min(1).optional(),
  line2: z.string().optional(),
  postalCode: z.string().min(2).optional(),
  city: z.string().min(1).optional(),
  countryCode: z.string().length(2).optional(),
  isResidential: z.boolean().optional(),
  /** Parcel point to drop parcels at (for point-to-* services). */
  pointId: z.string().optional(),
})

const parcelSchema = z.object({
  /**
   * `single` — one parcel for the whole fulfillment (summed weight).
   * `per_item` — one parcel per unit.
   */
  strategy: z.enum(["single", "per_item"]).default("single"),
  /** Package type from `service_structure.package_type`. */
  packageType: z.string().default("PACZKA"),
  /** Unit of `variant.weight` in your catalog. */
  weightUnit: z.enum(["g", "kg"]).default("g"),
  /** Unit of `variant.length/width/height` in your catalog. */
  dimensionUnit: z.enum(["mm", "cm", "m"]).default("cm"),
  /** Used when a variant has no weight (kg). */
  defaultItemWeightKg: z.number().positive().default(1),
  /** Added once per parcel for the box and filler (kg). */
  packagingWeightKg: z.number().nonnegative().default(0),
  minWeightKg: z.number().positive().default(0.1),
  /** Box used when items have no dimensions, and for `single` parcels (cm). */
  defaultDimensionsCm: z
    .object({
      length: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .default({ length: 30, width: 20, height: 10 }),
  nonStandard: z.boolean().default(false),
})

const pricingSchema = z.object({
  /** Which Apaczka price to charge the customer. */
  basis: z.enum(["gross", "net"]).default("gross"),
  markupPercent: z.number().min(-100).default(0),
  /** Fixed amount added after the percentage markup (store currency). */
  markupFixed: z.number().default(0),
  /** Round the final price up to a multiple of this value (e.g. 0.5, 1). */
  roundUpTo: z.number().positive().optional(),
  /** Free shipping when the cart subtotal is at or above this amount. */
  freeShippingThreshold: z.number().nonnegative().optional(),
  /** Charged when live pricing fails. If unset, the error is surfaced. */
  fallbackAmount: z.number().nonnegative().optional(),
  /** PLN → currency multipliers for non-PLN carts, e.g. `{ eur: 0.23 }`. */
  exchangeRates: z.record(z.string(), z.number().positive()).default({}),
})

const pickupSchema = z.object({
  /** `SELF` — you drop parcels off. `COURIER` — a courier collects them. */
  type: z.enum(["SELF", "COURIER"]).default("SELF"),
  /** Preferred courier window, `HH:MM`. */
  hoursFrom: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("09:00"),
  hoursTo: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("16:00"),
  /** Use the first available pickup day at least this many days ahead. */
  minDaysAhead: z.number().int().nonnegative().default(0),
})

/**
 * Same fields, all optional and without defaults. (`.partial()` keeps
 * defaults in zod 4, which would make every override reset the global
 * value it doesn't mention.)
 */
function overrideOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const inner = field instanceof z.ZodDefault ? field.unwrap() : field
      return [key, (inner as z.ZodType).optional()]
    })
  )
  return z.object(shape) as unknown as z.ZodType<Partial<z.output<z.ZodObject<T>>>>
}

const serviceOverrideSchema = z.object({
  /** Shown in the admin when creating shipping options. */
  name: z.string().optional(),
  pricing: overrideOf(pricingSchema).optional(),
  parcel: overrideOf(parcelSchema).optional(),
  pickup: overrideOf(pickupSchema).optional(),
  /** Apaczka additional services (option ID → value) for this service. */
  options: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
})

export const pluginOptionsSchema = z.object({
  /* Credentials ----------------------------------------------------------- */
  appId: z.string().min(1, "appId is required (Apaczka panel → Settings → API)"),
  appSecret: z.string().min(1, "appSecret is required (Apaczka panel → Settings → API)"),
  environment: z.enum(["production", "sandbox"]).default("production"),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().positive().default(15_000),
  maxRetries: z.number().int().min(0).max(5).default(2),

  /* Sender ---------------------------------------------------------------- */
  /**
   * Defaults merged under each stock location's address. Medusa stock
   * locations have no email or contact person, so set those here.
   */
  sender: senderSchema.default({}),
  /** Per stock location overrides, keyed by stock location ID. */
  senderByLocation: z.record(z.string(), senderSchema).default({}),

  /* Behaviour ------------------------------------------------------------- */
  /**
   * `auto` — create the Apaczka order when a fulfillment is created.
   * `manual` — create it later from the order page (lets staff adjust parcels).
   */
  shipmentCreation: z.enum(["auto", "manual"]).default("auto"),
  labelFormat: z.enum(["pdf", "zpl"]).default("pdf"),
  /** Limit the services offered in the admin. Empty = all from the account. */
  enabledServices: z.array(z.number().int()).default([]),
  /** Offer a "cash on delivery" variant of each service. */
  offerCodVariants: z.boolean().default(true),
  /** Offer a return variant of each service. */
  offerReturnVariants: z.boolean().default(true),

  parcel: parcelSchema.default(parcelSchema.parse({})),
  pricing: pricingSchema.default(pricingSchema.parse({})),
  pickup: pickupSchema.default(pickupSchema.parse({})),
  services: z.record(z.string(), serviceOverrideSchema).default({}),

  cod: z
    .object({
      /** IBAN for COD payouts. */
      bankAccount: z.string().optional(),
      /** Or the ID of a bank account saved in the Apaczka panel. */
      bankAccountId: z.number().int().optional(),
    })
    .default({}),

  insurance: z
    .object({
      /** `order_total` declares the fulfilled items' value. */
      mode: z.enum(["none", "order_total", "fixed"]).default("none"),
      /** For `fixed`, in PLN. */
      amount: z.number().nonnegative().optional(),
    })
    .default({ mode: "none" }),

  /** Apaczka additional services applied to every order (option ID → value). */
  defaultOptions: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  /** Apaczka's own e-mail/SMS notifications. */
  notifications: z.custom<ApaczkaNotificationSettings>().optional(),

  /**
   * Parcel content text. Placeholders: `{display_id}`, `{order_id}`, `{items}`.
   * Some carriers print it on the label.
   */
  contentTemplate: z.string().default("Order #{display_id}"),
  commentTemplate: z.string().optional(),

  /* Tracking -------------------------------------------------------------- */
  webhooks: z
    .object({
      /**
       * Public URL of your Medusa backend, e.g. `https://api.shop.pl`. When
       * set, every order is created with a per-order webhook URL pointing at
       * this plugin. You can instead set the URL once in the Apaczka panel.
       */
      backendUrl: z.string().url().optional(),
    })
    .default({}),
  tracking: z
    .object({
      /** Poll `tracking/` as a backup for missed webhooks. */
      polling: z.boolean().default(true),
      /** Mark the Medusa fulfillment shipped when the carrier takes the parcel. */
      markShipped: z.boolean().default(true),
      /** Mark the Medusa fulfillment delivered when Apaczka reports delivery. */
      markDelivered: z.boolean().default(true),
    })
    .default({ polling: true, markShipped: true, markDelivered: true }),

  /* Caching --------------------------------------------------------------- */
  serviceStructureTtlMinutes: z
    .number()
    .positive()
    .default(24 * 60),
  pointsTtlMinutes: z
    .number()
    .positive()
    .default(12 * 60),
  /**
   * Countries whose parcel points the store API may return (ISO alpha-2).
   * Add e.g. "CZ" for Packeta or international InPost points.
   */
  pointCountries: z.array(z.string().length(2)).min(1).default(["PL"]),
  /** Supplier → `points/{type}/` type, for suppliers whose code differs. */
  pointTypes: z.record(z.string(), z.string()).default({}),

  /* Escape hatches -------------------------------------------------------- */
  /** Replace the built-in parcel builder. */
  buildParcels: fn<(context: ParcelContext) => ApaczkaParcel[]>().optional(),
  /** Last-chance edit of the payload before it is priced or sent. */
  transformOrder:
    fn<
      (order: ApaczkaOrderInput, context: TransformOrderContext) => ApaczkaOrderInput | Promise<ApaczkaOrderInput>
    >().optional(),
})

export type ApaczkaPluginOptionsInput = z.input<typeof pluginOptionsSchema>
export type ApaczkaPluginOptions = z.output<typeof pluginOptionsSchema>
export type SenderOptions = z.output<typeof senderSchema>
export type ParcelOptions = z.output<typeof parcelSchema>
export type PricingOptions = z.output<typeof pricingSchema>
export type PickupOptions = z.output<typeof pickupSchema>

export type TransformOrderContext = {
  purpose: "valuation" | "shipment"
  serviceId?: number
  isReturn: boolean
  orderId?: string
  cartId?: string
}

/* ------------------------------------------------------------------------ */
/* Resolution                                                                */
/* ------------------------------------------------------------------------ */

/** Validates raw plugin options, throwing a readable error on mistakes. */
export function resolveOptions(raw: unknown): ApaczkaPluginOptions {
  const result = pluginOptionsSchema.safeParse(raw ?? {})
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n")
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid @bitshaft/medusa-plugin-apaczka options:\n${details}`
    )
  }
  return result.data
}

/** Options for one service, with its overrides applied. */
export function optionsForService(options: ApaczkaPluginOptions, serviceId?: number) {
  const override = serviceId === undefined ? undefined : options.services[String(serviceId)]
  return {
    pricing: { ...options.pricing, ...override?.pricing } as PricingOptions,
    parcel: { ...options.parcel, ...override?.parcel } as ParcelOptions,
    pickup: { ...options.pickup, ...override?.pickup } as PickupOptions,
    additionalServices: { ...options.defaultOptions, ...override?.options },
  }
}
