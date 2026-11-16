import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

export const PLUGIN_NAME = "negotiations"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-negotiations"

const int = (min: number, max: number) => z.number().int().min(min).max(max)

export const limitsSchema = z.object({
  /** Threads a customer may have open (open or with a counter-offer) at once. */
  openThreads: int(1, 1000).default(10),
  /** New threads per customer per hour. */
  threadsPerHour: int(1, 1000).default(5),
  /** Customer messages per hour, across all their threads. */
  messagesPerHour: int(1, 10_000).default(30),
  /** Characters in one message. */
  messageLength: int(1, 20_000).default(2000),
  /** Quantity of one line. */
  maxQuantity: int(1, 10_000_000).default(10_000),
})

export const pluginOptionsSchema = z.object({
  /** A thread with no move for this many days expires. 0 = never. */
  expiryDays: int(0, 3650).default(14),
  /** Days the customer has to use an accepted price. Default: expiryDays, or 14 when expiryDays is 0. */
  acceptedOfferDays: int(1, 3650).optional(),
  // Net or gross is not an option: each thread takes it from the catalog
  // price it starts from (Medusa's tax-inclusive pricing per region or
  // currency), so agreed prices mean what the customer saw.
  /** Currency of product threads when the customer sends none. Default: the store's default currency. */
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[a-zA-Z]{3}$/, "must be a 3-letter ISO currency code")
    .transform((value) => value.toLowerCase())
    .optional(),
  /** Customers may accept a counter-offer themselves. */
  customerAccept: z.boolean().default(true),
  /** Only customers in these groups (ids or names) may negotiate. Empty = every signed-in customer. */
  allowedCustomerGroups: z.array(z.string().trim().min(1)).default([]),
  /** Writes after acceptance. Each is off by default and must also be armed in the admin settings. */
  writers: z
    .object({ draftOrders: z.boolean().default(false), cart: z.boolean().default(false) })
    .default({ draftOrders: false, cart: false }),
  limits: limitsSchema.default(limitsSchema.parse({})),
  /** Sample threads in every state on the admin page; demo threads never expire and never write. */
  demo: z.boolean().default(false),
})

export type NegotiationsPluginOptions = z.output<typeof pluginOptionsSchema> & { acceptedOfferDays: number }
export type Limits = z.output<typeof limitsSchema>

/** No option is required; invalid values keep the plugin disabled with one log line. */
export function parseOptions(raw: unknown): PluginOptionsResult<NegotiationsPluginOptions> {
  const parsed = parsePluginOptions(pluginOptionsSchema, raw)
  if (!parsed.enabled) return parsed
  const options = parsed.options
  return {
    enabled: true,
    options: { ...options, acceptedOfferDays: options.acceptedOfferDays ?? (options.expiryDays || 14) },
  }
}

export const DEFAULT_OPTIONS: NegotiationsPluginOptions = (() => {
  const parsed = parseOptions({})
  if (!parsed.enabled)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "The default negotiations options are invalid")
  return parsed.options
})()
