"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluginOptionsSchema = void 0;
exports.resolveOptions = resolveOptions;
exports.optionsForService = optionsForService;
const utils_1 = require("@medusajs/framework/utils");
const zod_1 = require("@medusajs/framework/zod");
/* ------------------------------------------------------------------------ */
/* Schema                                                                    */
/* ------------------------------------------------------------------------ */
const fn = () => zod_1.z.custom((value) => typeof value === "function", "Expected a function");
const senderSchema = zod_1.z.object({
    /** Company or person name printed on the label. */
    name: zod_1.z.string().min(1).optional(),
    contactPerson: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().min(5).optional(),
    line1: zod_1.z.string().min(1).optional(),
    line2: zod_1.z.string().optional(),
    postalCode: zod_1.z.string().min(2).optional(),
    city: zod_1.z.string().min(1).optional(),
    countryCode: zod_1.z.string().length(2).optional(),
    isResidential: zod_1.z.boolean().optional(),
    /** Parcel point to drop parcels at (for point-to-* services). */
    pointId: zod_1.z.string().optional(),
});
const parcelSchema = zod_1.z.object({
    /**
     * `single` — one parcel for the whole fulfillment (summed weight).
     * `per_item` — one parcel per unit.
     */
    strategy: zod_1.z.enum(["single", "per_item"]).default("single"),
    /** Package type from `service_structure.package_type`. */
    packageType: zod_1.z.string().default("PACZKA"),
    /** Unit of `variant.weight` in your catalog. */
    weightUnit: zod_1.z.enum(["g", "kg"]).default("g"),
    /** Unit of `variant.length/width/height` in your catalog. */
    dimensionUnit: zod_1.z.enum(["mm", "cm", "m"]).default("cm"),
    /** Used when a variant has no weight (kg). */
    defaultItemWeightKg: zod_1.z.number().positive().default(1),
    /** Added once per parcel for the box and filler (kg). */
    packagingWeightKg: zod_1.z.number().nonnegative().default(0),
    minWeightKg: zod_1.z.number().positive().default(0.1),
    /** Box used when items have no dimensions, and for `single` parcels (cm). */
    defaultDimensionsCm: zod_1.z
        .object({
        length: zod_1.z.number().positive(),
        width: zod_1.z.number().positive(),
        height: zod_1.z.number().positive(),
    })
        .default({ length: 30, width: 20, height: 10 }),
    nonStandard: zod_1.z.boolean().default(false),
});
const pricingSchema = zod_1.z.object({
    /** Which Apaczka price to charge the customer. */
    basis: zod_1.z.enum(["gross", "net"]).default("gross"),
    markupPercent: zod_1.z.number().min(-100).default(0),
    /** Fixed amount added after the percentage markup (store currency). */
    markupFixed: zod_1.z.number().default(0),
    /** Round the final price up to a multiple of this value (e.g. 0.5, 1). */
    roundUpTo: zod_1.z.number().positive().optional(),
    /** Free shipping when the cart subtotal is at or above this amount. */
    freeShippingThreshold: zod_1.z.number().nonnegative().optional(),
    /** Charged when live pricing fails. If unset, the error is surfaced. */
    fallbackAmount: zod_1.z.number().nonnegative().optional(),
    /** PLN → currency multipliers for non-PLN carts, e.g. `{ eur: 0.23 }`. */
    exchangeRates: zod_1.z.record(zod_1.z.string(), zod_1.z.number().positive()).default({}),
});
const pickupSchema = zod_1.z.object({
    /** `SELF` — you drop parcels off. `COURIER` — a courier collects them. */
    type: zod_1.z.enum(["SELF", "COURIER"]).default("SELF"),
    /** Preferred courier window, `HH:MM`. */
    hoursFrom: zod_1.z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .default("09:00"),
    hoursTo: zod_1.z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .default("16:00"),
    /** Use the first available pickup day at least this many days ahead. */
    minDaysAhead: zod_1.z.number().int().nonnegative().default(0),
});
/**
 * Same fields, all optional and without defaults. (`.partial()` keeps
 * defaults in zod 4, which would make every override reset the global
 * value it doesn't mention.)
 */
function overrideOf(schema) {
    const shape = Object.fromEntries(Object.entries(schema.shape).map(([key, field]) => {
        const inner = field instanceof zod_1.z.ZodDefault ? field.unwrap() : field;
        return [key, inner.optional()];
    }));
    return zod_1.z.object(shape);
}
const serviceOverrideSchema = zod_1.z.object({
    /** Shown in the admin when creating shipping options. */
    name: zod_1.z.string().optional(),
    pricing: overrideOf(pricingSchema).optional(),
    parcel: overrideOf(parcelSchema).optional(),
    pickup: overrideOf(pickupSchema).optional(),
    /** Apaczka additional services (option ID → value) for this service. */
    options: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.number(), zod_1.z.string(), zod_1.z.boolean()])).optional(),
});
exports.pluginOptionsSchema = zod_1.z.object({
    /* Credentials ----------------------------------------------------------- */
    appId: zod_1.z.string().min(1, "appId is required (Apaczka panel → Settings → API)"),
    appSecret: zod_1.z.string().min(1, "appSecret is required (Apaczka panel → Settings → API)"),
    environment: zod_1.z.enum(["production", "sandbox"]).default("production"),
    baseUrl: zod_1.z.string().url().optional(),
    timeoutMs: zod_1.z.number().int().positive().default(15_000),
    maxRetries: zod_1.z.number().int().min(0).max(5).default(2),
    /* Sender ---------------------------------------------------------------- */
    /**
     * Defaults merged under each stock location's address. Medusa stock
     * locations have no email or contact person, so set those here.
     */
    sender: senderSchema.default({}),
    /** Per stock location overrides, keyed by stock location ID. */
    senderByLocation: zod_1.z.record(zod_1.z.string(), senderSchema).default({}),
    /* Behaviour ------------------------------------------------------------- */
    /**
     * `auto` — create the Apaczka order when a fulfillment is created.
     * `manual` — create it later from the order page (lets staff adjust parcels).
     */
    shipmentCreation: zod_1.z.enum(["auto", "manual"]).default("auto"),
    labelFormat: zod_1.z.enum(["pdf", "zpl"]).default("pdf"),
    /** Limit the services offered in the admin. Empty = all from the account. */
    enabledServices: zod_1.z.array(zod_1.z.number().int()).default([]),
    /** Offer a "cash on delivery" variant of each service. */
    offerCodVariants: zod_1.z.boolean().default(true),
    /** Offer a return variant of each service. */
    offerReturnVariants: zod_1.z.boolean().default(true),
    parcel: parcelSchema.default(parcelSchema.parse({})),
    pricing: pricingSchema.default(pricingSchema.parse({})),
    pickup: pickupSchema.default(pickupSchema.parse({})),
    services: zod_1.z.record(zod_1.z.string(), serviceOverrideSchema).default({}),
    cod: zod_1.z
        .object({
        /** IBAN for COD payouts. */
        bankAccount: zod_1.z.string().optional(),
        /** Or the ID of a bank account saved in the Apaczka panel. */
        bankAccountId: zod_1.z.number().int().optional(),
    })
        .default({}),
    insurance: zod_1.z
        .object({
        /** `order_total` declares the fulfilled items' value. */
        mode: zod_1.z.enum(["none", "order_total", "fixed"]).default("none"),
        /** For `fixed`, in PLN. */
        amount: zod_1.z.number().nonnegative().optional(),
    })
        .default({ mode: "none" }),
    /** Apaczka additional services applied to every order (option ID → value). */
    defaultOptions: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.number(), zod_1.z.string(), zod_1.z.boolean()])).default({}),
    /** Apaczka's own e-mail/SMS notifications. */
    notifications: zod_1.z.custom().optional(),
    /**
     * Parcel content text. Placeholders: `{display_id}`, `{order_id}`, `{items}`.
     * Some carriers print it on the label.
     */
    contentTemplate: zod_1.z.string().default("Order #{display_id}"),
    commentTemplate: zod_1.z.string().optional(),
    /* Tracking -------------------------------------------------------------- */
    webhooks: zod_1.z
        .object({
        /**
         * Public URL of your Medusa backend, e.g. `https://api.shop.pl`. When
         * set, every order is created with a per-order webhook URL pointing at
         * this plugin. You can instead set the URL once in the Apaczka panel.
         */
        backendUrl: zod_1.z.string().url().optional(),
    })
        .default({}),
    tracking: zod_1.z
        .object({
        /** Poll `tracking/` as a backup for missed webhooks. */
        polling: zod_1.z.boolean().default(true),
        /** Mark the Medusa fulfillment shipped when the carrier takes the parcel. */
        markShipped: zod_1.z.boolean().default(true),
        /** Mark the Medusa fulfillment delivered when Apaczka reports delivery. */
        markDelivered: zod_1.z.boolean().default(true),
    })
        .default({ polling: true, markShipped: true, markDelivered: true }),
    /* Caching --------------------------------------------------------------- */
    serviceStructureTtlMinutes: zod_1.z
        .number()
        .positive()
        .default(24 * 60),
    pointsTtlMinutes: zod_1.z
        .number()
        .positive()
        .default(12 * 60),
    /** Supplier → `points/{type}/` type, for suppliers whose code differs. */
    pointTypes: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).default({}),
    /* Escape hatches -------------------------------------------------------- */
    /** Replace the built-in parcel builder. */
    buildParcels: fn().optional(),
    /** Last-chance edit of the payload before it is priced or sent. */
    transformOrder: fn().optional(),
});
/* ------------------------------------------------------------------------ */
/* Resolution                                                                */
/* ------------------------------------------------------------------------ */
/** Validates raw plugin options, throwing a readable error on mistakes. */
function resolveOptions(raw) {
    const result = exports.pluginOptionsSchema.safeParse(raw ?? {});
    if (!result.success) {
        const details = result.error.issues
            .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("\n");
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Invalid @bitshaft/medusa-plugin-apaczka options:\n${details}`);
    }
    return result.data;
}
/** Options for one service, with its overrides applied. */
function optionsForService(options, serviceId) {
    const override = serviceId === undefined ? undefined : options.services[String(serviceId)];
    return {
        pricing: { ...options.pricing, ...override?.pricing },
        parcel: { ...options.parcel, ...override?.parcel },
        pickup: { ...options.pickup, ...override?.pickup },
        additionalServices: { ...options.defaultOptions, ...override?.options },
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvb3B0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFvUEEsd0NBWUM7QUFHRCw4Q0FRQztBQTNRRCxxREFBdUQ7QUFDdkQsaURBQTJDO0FBSzNDLDhFQUE4RTtBQUM5RSwrRUFBK0U7QUFDL0UsOEVBQThFO0FBRTlFLE1BQU0sRUFBRSxHQUFHLEdBQU0sRUFBRSxDQUFDLE9BQUMsQ0FBQyxNQUFNLENBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLE9BQU8sS0FBSyxLQUFLLFVBQVUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO0FBRTlGLE1BQU0sWUFBWSxHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7SUFDNUIsbURBQW1EO0lBQ25ELElBQUksRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJQUNsQyxhQUFhLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUU7SUFDM0MsS0FBSyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDcEMsS0FBSyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFO0lBQ25DLEtBQUssRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJQUNuQyxLQUFLLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUM1QixVQUFVLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUU7SUFDeEMsSUFBSSxFQUFFLE9B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