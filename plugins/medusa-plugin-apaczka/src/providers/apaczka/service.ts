import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types"
import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"

import { ApaczkaApiError, ApaczkaClient, ApaczkaError, type ApaczkaAddress } from "../../lib/apaczka"
import { assertCompleteAddress, customerAddress, missingAddressFields, warehouseAddress } from "../../lib/addresses"
import { ApaczkaCatalog } from "../../lib/catalog"
import {
  type ApaczkaFulfillmentData,
  type ApaczkaFulfillmentState,
  type ApaczkaPointSnapshot,
  type ApaczkaShippingMethodData,
  readFulfillmentData,
  type ShipmentOverrides,
} from "../../lib/data"
import {
  type ApaczkaFulfillmentOption,
  buildFulfillmentOptions,
  parseFulfillmentOption,
} from "../../lib/fulfillment-options"
import { priceForCustomer } from "../../lib/money"
import { buildOrderPayload } from "../../lib/order-builder"
import { type ApaczkaPluginOptions, optionsForService, resolveOptions } from "../../lib/options"
import type { ParcelItem } from "../../lib/parcels"
import { createShipment, labelsFor } from "../../lib/shipments"
import { userAgent } from "../../lib/version"

type InjectedDependencies = { logger: Logger }

/** Accepted under `additional_data.apaczka` when creating a fulfillment. */
export type ApaczkaAdditionalData = {
  /** Skip creating the Apaczka order now; create it later from the admin. */
  defer?: boolean
  /** Fully resolved sender address (takes precedence over everything else). */
  sender?: ApaczkaAddress
  overrides?: ShipmentOverrides
}

/** Store the option snapshot on the shipping method so fulfillments don't depend on the dictionary. */
const OPTION_KEY = "apaczka_option"

const QUOTE_TTL_MS = 60_000
const QUOTE_CACHE_SIZE = 500

/**
 * Medusa fulfillment provider for Apaczka.pl.
 *
 * Register it under the Fulfillment Module:
 *
 * ```ts
 * {
 *   resolve: "@medusajs/medusa/fulfillment",
 *   options: {
 *     providers: [
 *       { resolve: "@bitshaft/medusa-plugin-apaczka/providers/apaczka", id: "apaczka", options: apaczkaOptions },
 *     ],
 *   },
 * }
 * ```
 */
export class ApaczkaFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "apaczka"

  protected readonly logger_: Logger
  protected readonly options_: ApaczkaPluginOptions
  protected readonly client_: ApaczkaClient
  protected readonly catalog_: ApaczkaCatalog
  private readonly quotes_ = new Map<string, { at: number; value: Promise<{ price: number; price_gross: number }> }>()

  static validateOptions(options: Record<string, unknown>): void {
    resolveOptions(options)
  }

  constructor({ logger }: InjectedDependencies, options: Record<string, unknown>) {
    super()
    this.logger_ = logger
    this.options_ = resolveOptions(options)
    this.client_ = new ApaczkaClient({
      appId: this.options_.appId,
      appSecret: this.options_.appSecret,
      environment: this.options_.environment,
      baseUrl: this.options_.baseUrl,
      timeoutMs: this.options_.timeoutMs,
      maxRetries: this.options_.maxRetries,
      userAgent: userAgent(),
      logger,
    })
    this.catalog_ = new ApaczkaCatalog(this.client_, {
      serviceStructureTtlMs: this.options_.serviceStructureTtlMinutes * 60_000,
      pointsTtlMs: this.options_.pointsTtlMinutes * 60_000,
      logger,
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Shipping options (admin)                                                */
  /* ---------------------------------------------------------------------- */

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    try {
      const structure = await this.catalog_.getServiceStructure()
      return buildFulfillmentOptions(structure, this.options_)
    } catch (error) {
      throw toMedusaError(error, "Could not load services from Apaczka")
    }
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return parseFulfillmentOption(data) !== undefined
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    return parseFulfillmentOption(data.data) !== undefined
  }

  /* ---------------------------------------------------------------------- */
  /* Checkout                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Runs when a shipping method is added to a cart. Checks the parcel point
   * for point-delivery services and stores a snapshot of the option and the
   * point on the shipping method.
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext
  ): Promise<ApaczkaShippingMethodData & Record<string, unknown>> {
    const option = this.requireOption(optionData)
    const pointId = typeof data?.point_id === "string" ? data.point_id.trim() : undefined

    if (option.destination === "point" && !option.is_return && !pointId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `${option.name} delivers to a parcel point. Pass the chosen point as \`data.point_id\`.`
      )
    }

    let point: ApaczkaPointSnapshot | undefined
    if (pointId && option.points_type) {
      point = await this.lookupPoint(option, pointId, context.shipping_address?.country_code ?? "pl")
    }

    const location = context.from_location
    return {
      ...data,
      ...(pointId ? { point_id: pointId } : {}),
      ...(point ? { point } : {}),
      location_id: location?.id,
      // The provider only receives a location ID at fulfillment time, so keep
      // the address it was quoted from.
      ...(location?.id
        ? { location: { id: location.id, name: location.name, address: stripId(location.address) } }
        : {}),
      [OPTION_KEY]: option,
    }
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const option = this.requireOption(optionData)
    const pricing = optionsForService(this.options_, option.service_id).pricing
    const currencyCode = String((context as { currency_code?: string }).currency_code ?? "pln")
    const items = (context.items ?? []) as CartItemLike[]

    try {
      const customer = customerAddress(
        context.shipping_address as never,
        (context as { email?: string }).email,
        typeof data?.point_id === "string" ? data.point_id : undefined
      )
      const missing = missingAddressFields(customer).filter((field) => field !== "name")
      if (missing.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Enter a shipping address to price ${option.name} (missing: ${missing.join(", ")}).`
        )
      }

      const location = context.from_location as { id?: string } | undefined
      const warehouse = this.warehouseFor(location as never)

      const payload = await buildOrderPayload({
        options: this.options_,
        option,
        purpose: "valuation",
        warehouse,
        customer: { ...customer, name: customer.name || "Klient" },
        items: items.map(toParcelItem),
        itemsValue: cartSubtotal(items),
        codAmount: option.cod ? cartSubtotal(items) : undefined,
        cartId: context.id,
      })

      const quote = await this.quote(payload, option.service_id)

      return {
        calculated_amount: priceForCustomer({
          quote,
          currencyCode,
          pricing,
          cartSubtotal: cartSubtotal(items),
        }),
        is_calculated_price_tax_inclusive: pricing.basis === "gross",
      }
    } catch (error) {
      if (pricing.fallbackAmount !== undefined) {
        this.logger_.warn(
          `[apaczka] Live price for ${option.name} failed, charging the fallback amount: ${(error as Error).message}`
        )
        return {
          calculated_amount: pricing.fallbackAmount,
          is_calculated_price_tax_inclusive: pricing.basis === "gross",
        }
      }
      throw toMedusaError(error, `Could not price ${option.name}`)
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Fulfillment                                                             */
  /* ---------------------------------------------------------------------- */

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>,
    additionalData?: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    const shippingData = readFulfillmentData(data)
    const extra = (additionalData?.apaczka ?? {}) as ApaczkaAdditionalData
    const option = this.optionForFulfillment(data, order, fulfillment.shipping_option_id ?? undefined)

    if (!option) {
      return this.pending(
        shippingData,
        undefined,
        "Shipping method has no Apaczka service; create the shipment from the order page."
      )
    }
    if (extra.defer || this.options_.shipmentCreation === "manual") {
      return this.pending(shippingData, option)
    }

    const warehouse = extra.sender ?? this.senderForFulfillment(shippingData, fulfillment.location_id ?? undefined)
    if (!warehouse || missingAddressFields(warehouse).length) {
      const reason =
        "Sender address could not be resolved for this stock location. Create the shipment from the order page."
      this.logger_.warn(`[apaczka] ${reason} (fulfillment ${fulfillment.id ?? "new"})`)
      return this.pending(shippingData, option, reason)
    }

    const customer = customerAddress(
      fulfillment.delivery_address as never,
      orderEmail(order),
      extra.overrides?.point_id ?? shippingData.point_id
    )
    assertCompleteAddress(customer, "receiver")

    const orderItems = new Map((order?.items ?? []).map((item) => [item.id, item as unknown as OrderItemLike]))
    const parcelItems = items.map((item) => {
      const orderItem = orderItems.get(item.line_item_id as string)
      return toParcelItem({
        title: item.title ?? orderItem?.title,
        quantity: Number(item.quantity ?? 1),
        variant: orderItem?.variant,
      })
    })
    const itemsValue = items.reduce((sum, item) => {
      const orderItem = orderItems.get(item.line_item_id as string)
      return sum + Number(orderItem?.unit_price ?? 0) * Number(item.quantity ?? 0)
    }, 0)

    try {
      const created = await createShipment({
        client: this.client_,
        logger: this.logger_,
        build: {
          options: this.options_,
          option,
          warehouse,
          customer,
          items: parcelItems,
          itemsValue,
          codAmount: Number(order?.total ?? itemsValue),
          overrides: extra.overrides,
          displayId: (order as { display_id?: number } | undefined)?.display_id,
          orderId: order?.id,
        },
      })

      this.logger_.info(
        `[apaczka] Created order ${created.state.order_id} (${created.state.service_name}) for Medusa order ${order?.id ?? "-"}`
      )

      return {
        data: { ...shippingData, apaczka: created.state } satisfies ApaczkaFulfillmentData,
        labels: created.labels,
      }
    } catch (error) {
      throw toMedusaError(error, "Apaczka rejected the shipment")
    }
  }

  async cancelFulfillment(fulfillmentData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = readFulfillmentData(fulfillmentData)
    const state = data.apaczka

    if (!state?.order_id || state.state !== "created") {
      return { ...data, apaczka: state ? { ...state, state: "canceled" } : undefined }
    }

    try {
      await this.client_.cancelOrder(state.order_id)
    } catch (error) {
      if (error instanceof ApaczkaApiError) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Apaczka could not cancel order ${state.order_id}: ${error.message}. ` +
            "Parcels already handed to the carrier cannot be canceled."
        )
      }
      throw toMedusaError(error, `Could not cancel Apaczka order ${state.order_id}`)
    }

    return { ...data, apaczka: { ...state, state: "canceled", status: "canceled" } }
  }

  /**
   * Medusa does not pass the customer's address to this method, so the
   * return label is created right after by the plugin's
   * `order.return_requested` subscriber (or from the order page).
   */
  async createReturnFulfillment(fromData: Record<string, unknown>): Promise<CreateFulfillmentResult> {
    const shippingOption = (fromData.shipping_option ?? {}) as { data?: Record<string, unknown> }
    const option = parseFulfillmentOption(shippingOption.data)
    return this.pending({}, option ? { ...option, is_return: true } : undefined)
  }

  /* ---------------------------------------------------------------------- */
  /* Documents                                                               */
  /* ---------------------------------------------------------------------- */

  // Medusa's base class types these as `Promise<never[]>` / `Promise<void>`; the
  // interface (IFulfillmentProvider) allows `any`.
  async getFulfillmentDocuments(data: Record<string, unknown>): Promise<any> {
    return this.documentsFor(data)
  }
  async getShipmentDocuments(data: Record<string, unknown>): Promise<any> {
    return this.documentsFor(data)
  }
  async getReturnDocuments(data: Record<string, unknown>): Promise<any> {
    return this.documentsFor(data)
  }

  /**
   * Returns a document as `{ content (base64), content_type, file_name }`.
   * `documentType`: `label` (or `waybill`) and `dispatch_code`.
   */
  async retrieveDocuments(fulfillmentData: Record<string, unknown>, documentType: string): Promise<any> {
    const state = readFulfillmentData(fulfillmentData).apaczka
    if (!state?.order_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "This fulfillment has no Apaczka shipment yet")
    }

    try {
      if (documentType === "dispatch_code") {
        return await this.client_.getDispatchCode(state.order_id)
      }
      const waybill = await this.client_.getWaybill(state.order_id)
      const isZpl = waybill.type?.toLowerCase() === "zpl"
      return {
        content: waybill.waybill,
        content_type: isZpl ? "application/zpl" : "application/pdf",
        file_name: `apaczka-${state.order_id}.${isZpl ? "zpl" : "pdf"}`,
      }
    } catch (error) {
      throw toMedusaError(error, `Could not download the ${documentType} for Apaczka order ${state.order_id}`)
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  private requireOption(data: unknown): ApaczkaFulfillmentOption {
    const option = parseFulfillmentOption(data)
    if (!option) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Shipping option is not an Apaczka service")
    }
    return option
  }

  private optionForFulfillment(
    data: Record<string, unknown>,
    order: Partial<FulfillmentOrderDTO> | undefined,
    shippingOptionId?: string
  ): ApaczkaFulfillmentOption | undefined {
    const direct = parseFulfillmentOption(data?.[OPTION_KEY])
    if (direct) {
      return direct
    }
    const methods =
      (order as { shipping_methods?: Array<{ shipping_option_id?: string; data?: Record<string, unknown> }> })
        ?.shipping_methods ?? []
    const method = methods.find((m) => m.shipping_option_id === shippingOptionId) ?? methods[0]
    return parseFulfillmentOption(method?.data?.[OPTION_KEY])
  }

  private warehouseFor(location?: { id?: string; name?: string; address?: Record<string, string | null> } | null) {
    return warehouseAddress({
      location,
      defaults: this.options_.sender,
      overrides: location?.id ? this.options_.senderByLocation[location.id] : undefined,
    })
  }

  /**
   * The provider only gets the stock location ID at fulfillment time. Use
   * the location snapshot taken at checkout when it is the same location,
   * then the per-location overrides and global defaults. The plugin's own
   * workflow passes a fully resolved sender instead
   * (see `ApaczkaAdditionalData.sender`).
   */
  private senderForFulfillment(data: ApaczkaShippingMethodData, locationId?: string): ApaczkaAddress | undefined {
    const snapshot = data.location && (!locationId || data.location.id === locationId) ? data.location : null
    const id = locationId ?? snapshot?.id
    const address = warehouseAddress({
      location: snapshot,
      defaults: this.options_.sender,
      overrides: id ? this.options_.senderByLocation[id] : undefined,
    })
    return missingAddressFields(address).length ? undefined : address
  }

  private pending(
    data: ApaczkaShippingMethodData,
    option: ApaczkaFulfillmentOption | undefined,
    error?: string
  ): CreateFulfillmentResult {
    const state: ApaczkaFulfillmentState = {
      state: "pending",
      status: "pending",
      service_id: option?.service_id ?? 0,
      service_name: option?.service_name,
      supplier: option?.supplier,
      is_return: option?.is_return ?? false,
      cod: option?.cod ?? false,
      point_id: data.point_id,
      label_format: this.options_.labelFormat,
      ...(error ? { error } : {}),
    }
    return { data: { ...data, ...(option ? { [OPTION_KEY]: option } : {}), apaczka: state }, labels: [] }
  }

  private documentsFor(data: Record<string, unknown>): Array<{ type: string; url: string }> {
    const state = readFulfillmentData(data).apaczka
    return state ? labelsFor(state).map((label) => ({ type: "label", url: label.label_url })) : []
  }

  private async lookupPoint(
    option: ApaczkaFulfillmentOption,
    pointId: string,
    countryCode: string
  ): Promise<ApaczkaPointSnapshot | undefined> {
    let point
    try {
      point = await this.catalog_.findPoint(option.points_type!, pointId, countryCode)
    } catch (error) {
      // Never block checkout because the point directory is slow or down.
      this.logger_.warn(`[apaczka] Could not verify point ${pointId}: ${(error as Error).message}`)
      return undefined
    }

    if (!point) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Parcel point ${pointId} was not found for ${option.supplier}. Choose another point.`
      )
    }
    if (option.cod && point.option_cod === false) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Parcel point ${pointId} does not accept cash on delivery. Choose another point.`
      )
    }
    if (point.option_deliver === false) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Parcel point ${pointId} does not accept deliveries. Choose another point.`
      )
    }

    return {
      id: point.foreign_address_id,
      type: point.type,
      name: point.name,
      line1: point.address.line1,
      postal_code: point.address.postal_code,
      city: point.address.city,
      country_code: point.address.country_code,
    }
  }

  /** Valuation calls are cached briefly: checkout prices the same cart many times. */
  private async quote(
    payload: Awaited<ReturnType<typeof buildOrderPayload>>,
    serviceId: number
  ): Promise<{ price: number; price_gross: number }> {
    const key = JSON.stringify(payload)
    const now = Date.now()
    const cached = this.quotes_.get(key)
    if (cached && now - cached.at < QUOTE_TTL_MS) {
      return cached.value
    }

    const value = this.client_.valuateOrder(payload).then((valuation) => {
      const entry = valuation.price_table?.[String(serviceId)]
      if (!entry) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Apaczka service ${serviceId} cannot carry this parcel (check its weight, size and destination).`
        )
      }
      return { price: Number(entry.price), price_gross: Number(entry.price_gross) }
    })

    if (this.quotes_.size >= QUOTE_CACHE_SIZE) {
      this.quotes_.delete(this.quotes_.keys().next().value as string)
    }
    this.quotes_.set(key, { at: now, value })
    value.catch(() => this.quotes_.delete(key))
    return value
  }
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

type VariantLike = {
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
}

type CartItemLike = {
  title?: string
  quantity?: number | string
  unit_price?: number | string
  subtotal?: number | string
  variant?: VariantLike | null
}

type OrderItemLike = {
  title?: string
  unit_price?: number | string
  variant?: VariantLike | null
}

function toParcelItem(item: { title?: string; quantity?: number | string; variant?: VariantLike | null }): ParcelItem {
  return {
    title: item.title,
    quantity: Number(item.quantity ?? 1),
    weight: item.variant?.weight,
    length: item.variant?.length,
    width: item.variant?.width,
    height: item.variant?.height,
  }
}

function cartSubtotal(items: CartItemLike[]): number {
  return items.reduce((sum, item) => {
    const subtotal = Number(item.subtotal)
    return sum + (Number.isFinite(subtotal) ? subtotal : Number(item.unit_price ?? 0) * Number(item.quantity ?? 0))
  }, 0)
}

function orderEmail(order: Partial<FulfillmentOrderDTO> | undefined): string | undefined {
  const candidate = order as { email?: string; customer?: { email?: string } } | undefined
  return candidate?.email ?? candidate?.customer?.email ?? undefined
}

/** Converts client errors into MedusaErrors with a readable message. */
export function toMedusaError(error: unknown, context: string): MedusaError {
  if (error instanceof MedusaError) {
    return error
  }
  if (error instanceof ApaczkaApiError) {
    const type = error.isAuthenticationError ? MedusaError.Types.UNAUTHORIZED : MedusaError.Types.INVALID_DATA
    return new MedusaError(type, `${context}: ${error.message}`)
  }
  if (error instanceof ApaczkaError) {
    return new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `${context}: ${error.message}`)
  }
  return new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `${context}: ${(error as Error)?.message ?? error}`)
}

function stripId<T extends { id?: unknown }>(value: T | null | undefined): Omit<T, "id"> | null {
  if (!value) {
    return null
  }
  const { id, ...rest } = value
  return rest
}

export default ApaczkaFulfillmentProviderService
