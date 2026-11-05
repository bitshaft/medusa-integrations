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
    hoursFrom: zod_1.z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
    hoursTo: zod_1.z.string().regex(/^\d{2}:\d{2}$/).default("16:00"),
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
    serviceStructureTtlMinutes: zod_1.z.number().positive().default(24 * 60),
    pointsTtlMinutes: zod_1.z.number().positive().default(12 * 60),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvb3B0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUEyT0Esd0NBWUM7QUFHRCw4Q0FRQztBQWxRRCxxREFBdUQ7QUFDdkQsaURBQTJDO0FBUzNDLDhFQUE4RTtBQUM5RSwrRUFBK0U7QUFDL0UsOEVBQThFO0FBRTlFLE1BQU0sRUFBRSxHQUFHLEdBQU0sRUFBRSxDQUFDLE9BQUMsQ0FBQyxNQUFNLENBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLE9BQU8sS0FBSyxLQUFLLFVBQVUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO0FBRTlGLE1BQU0sWUFBWSxHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7SUFDNUIsbURBQW1EO0lBQ25ELElBQUksRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJQUNsQyxhQUFhLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUU7SUFDM0MsS0FBSyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDcEMsS0FBSyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFO0lBQ25DLEtBQUssRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJQUNuQyxLQUFLLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUM1QixVQUFVLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUU7SUFDeEMsSUFBSSxFQUFFLE9B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