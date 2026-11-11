import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import { WHITELIST_VAT_MODULE } from "../../modules/whitelist-vat"
import type WhitelistVatModuleService from "../../modules/whitelist-vat/service"
import { WhitelistVatEvents, type WhitelistVatVerifiedData } from "./events"
import type { Verification, VerifyInput } from "./verify"

/**
 * Finding the buyer's tax ID on Medusa records and verifying it. Medusa has
 * no tax ID field, so stores keep it in metadata; the keys to look at come
 * from the `taxIdKeys` option.
 */

type Metadata = Record<string, unknown> | null | undefined
type AddressLike = { metadata?: Metadata; country_code?: string | null } | null | undefined

export type TaxIdHolder = {
  metadata?: Metadata
  billing_address?: AddressLike
  shipping_address?: AddressLike
  customer?: { metadata?: Metadata } | null
}

export type FoundTaxId = {
  number: string
  /** Country to assume for numbers without a prefix. */
  country_code: string | null
  /** Where it was found, for the admin: `billing_address`, `shipping_address`, `metadata` or `customer`. */
  location: string
}

function readKey(metadata: Metadata, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
    if (typeof value === "number") {
      return String(value)
    }
  }
  return null
}

/** The first tax ID on the record: billing address, shipping address, the record itself, then the customer. */
export function findTaxId(holder: TaxIdHolder | null | undefined, keys: string[]): FoundTaxId | null {
  if (!holder) {
    return null
  }
  const country = holder.billing_address?.country_code ?? holder.shipping_address?.country_code ?? null
  const places: Array<[string, Metadata]> = [
    ["billing_address", holder.billing_address?.metadata],
    ["shipping_address", holder.shipping_address?.metadata],
    ["metadata", holder.metadata],
    ["customer", holder.customer?.metadata],
  ]
  for (const [location, metadata] of places) {
    const number = readKey(metadata, keys)
    if (number) {
      return { number, country_code: country, location }
    }
  }
  return null
}

const HOLDER_FIELDS = [
  "id",
  "metadata",
  "customer_id",
  "billing_address.metadata",
  "billing_address.country_code",
  "shipping_address.metadata",
  "shipping_address.country_code",
  "customer.metadata",
]

type Loaded = TaxIdHolder & { id: string; customer_id?: string | null }

async function load(container: MedusaContainer, entity: "order" | "cart" | "customer", id: string): Promise<Loaded> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity,
    filters: { id },
    fields: entity === "customer" ? ["id", "metadata"] : HOLDER_FIELDS,
  })
  const record = data[0] as unknown as Loaded | undefined
  if (!record) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `${entity} ${id} was not found`)
  }
  return record
}

/** Verifies a tax ID and announces the verdict when the registers were asked. */
export async function verifyAndEmit(container: MedusaContainer, input: VerifyInput): Promise<Verification> {
  const service = container.resolve<WhitelistVatModuleService>(WHITELIST_VAT_MODULE)
  const verification = await service.verify(input)
  if (!verification.from_cache && verification.tax_id.valid) {
    const data: WhitelistVatVerifiedData = {
      number: verification.tax_id.number,
      status: verification.status,
      verified: verification.verified,
      could_not_verify: verification.could_not_verify,
      subject_id: verification.subject_id,
      order_id: input.order_id ?? null,
      customer_id: input.customer_id ?? null,
    }
    try {
      await container.resolve(Modules.EVENT_BUS).emit({ name: WhitelistVatEvents.VERIFIED, data })
    } catch {
      // The event is a convenience for other code; the verification itself is stored.
    }
  }
  return verification
}

export type RecordVerification = {
  /** The tax ID found on the record; `null` when it has none. */
  tax_id: FoundTaxId | null
  verification: Verification | null
}

type RecordOptions = { force?: boolean; trigger?: string }

/** Verifies the tax ID of an order and keeps the answers as the order's proof. */
export async function verifyOrder(
  container: MedusaContainer,
  orderId: string,
  options: RecordOptions = {}
): Promise<RecordVerification> {
  const service = container.resolve<WhitelistVatModuleService>(WHITELIST_VAT_MODULE)
  const order = await load(container, "order", orderId)
  const taxId = findTaxId(order, (await service.getOptions()).taxIdKeys)
  if (!taxId) {
    return { tax_id: null, verification: null }
  }
  const verification = await verifyAndEmit(container, {
    number: taxId.number,
    country_code: taxId.country_code,
    force: options.force,
    trigger: options.trigger ?? "order",
    order_id: order.id,
    customer_id: order.customer_id ?? null,
  })
  return { tax_id: taxId, verification }
}

/** Verifies the tax ID of a cart, e.g. before it is completed. Nothing is tied to an order yet. */
export async function verifyCart(
  container: MedusaContainer,
  cartId: string,
  options: RecordOptions = {}
): Promise<RecordVerification> {
  const service = container.resolve<WhitelistVatModuleService>(WHITELIST_VAT_MODULE)
  const cart = await load(container, "cart", cartId)
  const taxId = findTaxId(cart, (await service.getOptions()).taxIdKeys)
  if (!taxId) {
    return { tax_id: null, verification: null }
  }
  const verification = await verifyAndEmit(container, {
    number: taxId.number,
    country_code: taxId.country_code,
    force: options.force,
    trigger: options.trigger ?? "checkout",
    cart_id: cart.id,
    customer_id: cart.customer_id ?? null,
  })
  return { tax_id: taxId, verification }
}

/** Verifies the tax ID kept on a customer. */
export async function verifyCustomer(
  container: MedusaContainer,
  customerId: string,
  options: RecordOptions = {}
): Promise<RecordVerification> {
  const service = container.resolve<WhitelistVatModuleService>(WHITELIST_VAT_MODULE)
  const customer = await load(container, "customer", customerId)
  const taxId = findTaxId({ customer }, (await service.getOptions()).taxIdKeys)
  if (!taxId) {
    return { tax_id: null, verification: null }
  }
  const verification = await verifyAndEmit(container, {
    number: taxId.number,
    country_code: taxId.country_code,
    force: options.force,
    trigger: options.trigger ?? "admin",
    customer_id: customer.id,
  })
  return { tax_id: taxId, verification }
}

/** The tax ID on a record without verifying it. */
export async function readTaxId(
  container: MedusaContainer,
  entity: "order" | "customer",
  id: string
): Promise<FoundTaxId | null> {
  const service = container.resolve<WhitelistVatModuleService>(WHITELIST_VAT_MODULE)
  const record = await load(container, entity, id)
  const keys = (await service.getOptions()).taxIdKeys
  return findTaxId(entity === "customer" ? { customer: record } : record, keys)
}
