"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaFulfillmentProviderService = void 0;
exports.toMedusaError = toMedusaError;
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = require("../../lib/apaczka");
const addresses_1 = require("../../lib/addresses");
const catalog_1 = require("../../lib/catalog");
const data_1 = require("../../lib/data");
const fulfillment_options_1 = require("../../lib/fulfillment-options");
const money_1 = require("../../lib/money");
const order_builder_1 = require("../../lib/order-builder");
const options_1 = require("../../lib/options");
const shipments_1 = require("../../lib/shipments");
const version_1 = require("../../lib/version");
/** Store the option snapshot on the shipping method so fulfillments don't depend on the dictionary. */
const OPTION_KEY = "apaczka_option";
const QUOTE_TTL_MS = 60_000;
const QUOTE_CACHE_SIZE = 500;
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
class ApaczkaFulfillmentProviderService extends utils_1.AbstractFulfillmentProviderService {
    static identifier = "apaczka";
    logger_;
    options_;
    client_;
    catalog_;
    quotes_ = new Map();
    static validateOptions(options) {
        (0, options_1.resolveOptions)(options);
    }
    constructor({ logger }, options) {
        super();
        this.logger_ = logger;
        this.options_ = (0, options_1.resolveOptions)(options);
        this.client_ = new apaczka_1.ApaczkaClient({
            appId: this.options_.appId,
            appSecret: this.options_.appSecret,
            environment: this.options_.environment,
            baseUrl: this.options_.baseUrl,
            timeoutMs: this.options_.timeoutMs,
            maxRetries: this.options_.maxRetries,
            userAgent: (0, version_1.userAgent)(),
            logger,
        });
        this.catalog_ = new catalog_1.ApaczkaCatalog(this.client_, {
            serviceStructureTtlMs: this.options_.serviceStructureTtlMinutes * 60_000,
            pointsTtlMs: this.options_.pointsTtlMinutes * 60_000,
            logger,
        });
    }
    /* ---------------------------------------------------------------------- */
    /* Shipping options (admin)                                                */
    /* ---------------------------------------------------------------------- */
    async getFulfillmentOptions() {
        try {
            const structure = await this.catalog_.getServiceStructure();
            return (0, fulfillment_options_1.buildFulfillmentOptions)(structure, this.options_);
        }
        catch (error) {
            throw toMedusaError(error, "Could not load services from Apaczka");
        }
    }
    async validateOption(data) {
        return (0, fulfillment_options_1.parseFulfillmentOption)(data) !== undefined;
    }
    async canCalculate(data) {
        return (0, fulfillment_options_1.parseFulfillmentOption)(data.data) !== undefined;
    }
    /* ---------------------------------------------------------------------- */
    /* Checkout                                                                */
    /* ---------------------------------------------------------------------- */
    /**
     * Runs when a shipping method is added to a cart. Checks the parcel point
     * for point-delivery services and stores a snapshot of the option and the
     * point on the shipping method.
     */
    async validateFulfillmentData(optionData, data, context) {
        const option = this.requireOption(optionData);
        const pointId = typeof data?.point_id === "string" ? data.point_id.trim() : undefined;
        if (option.destination === "point" && !option.is_return && !pointId) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `${option.name} delivers to a parcel point. Pass the chosen point as \`data.point_id\`.`);
        }
        let point;
        if (pointId && option.points_type) {
            point = await this.lookupPoint(option, pointId, context.shipping_address?.country_code ?? "pl");
        }
        const location = context.from_location;
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
        };
    }
    async calculatePrice(optionData, data, context) {
        const option = this.requireOption(optionData);
        const pricing = (0, options_1.optionsForService)(this.options_, option.service_id).pricing;
        const currencyCode = String(context.currency_code ?? "pln");
        const items = (context.items ?? []);
        try {
            const customer = (0, addresses_1.customerAddress)(context.shipping_address, context.email, typeof data?.point_id === "string" ? data.point_id : undefined);
            const missing = (0, addresses_1.missingAddressFields)(customer).filter((field) => field !== "name");
            if (missing.length) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Enter a shipping address to price ${option.name} (missing: ${missing.join(", ")}).`);
            }
            const location = context.from_location;
            const warehouse = this.warehouseFor(location);
            const payload = await (0, order_builder_1.buildOrderPayload)({
                options: this.options_,
                option,
                purpose: "valuation",
                warehouse,
                customer: { ...customer, name: customer.name || "Klient" },
                items: items.map(toParcelItem),
                itemsValue: cartSubtotal(items),
                codAmount: option.cod ? cartSubtotal(items) : undefined,
                cartId: context.id,
            });
            const quote = await this.quote(payload, option.service_id);
            return {
                calculated_amount: (0, money_1.priceForCustomer)({
                    quote,
                    currencyCode,
                    pricing,
                    cartSubtotal: cartSubtotal(items),
                }),
                is_calculated_price_tax_inclusive: pricing.basis === "gross",
            };
        }
        catch (error) {
            if (pricing.fallbackAmount !== undefined) {
                this.logger_.warn(`[apaczka] Live price for ${option.name} failed, charging the fallback amount: ${error.message}`);
                return {
                    calculated_amount: pricing.fallbackAmount,
                    is_calculated_price_tax_inclusive: pricing.basis === "gross",
                };
            }
            throw toMedusaError(error, `Could not price ${option.name}`);
        }
    }
    /* ---------------------------------------------------------------------- */
    /* Fulfillment                                                             */
    /* ---------------------------------------------------------------------- */
    async createFulfillment(data, items, order, fulfillment, additionalData) {
        const shippingData = (0, data_1.readFulfillmentData)(data);
        const extra = (additionalData?.apaczka ?? {});
        const option = this.optionForFulfillment(data, order, fulfillment.shipping_option_id ?? undefined);
        if (!option) {
            return this.pending(shippingData, undefined, "Shipping method has no Apaczka service; create the shipment from the order page.");
        }
        if (extra.defer || this.options_.shipmentCreation === "manual") {
            return this.pending(shippingData, option);
        }
        const warehouse = extra.sender ?? this.senderForFulfillment(shippingData, fulfillment.location_id ?? undefined);
        if (!warehouse || (0, addresses_1.missingAddressFields)(warehouse).length) {
            const reason = "Sender address could not be resolved for this stock location. Create the shipment from the order page.";
            this.logger_.warn(`[apaczka] ${reason} (fulfillment ${fulfillment.id ?? "new"})`);
            return this.pending(shippingData, option, reason);
        }
        const customer = (0, addresses_1.customerAddress)(fulfillment.delivery_address, orderEmail(order), extra.overrides?.point_id ?? shippingData.point_id);
        (0, addresses_1.assertCompleteAddress)(customer, "receiver");
        const orderItems = new Map((order?.items ?? []).map((item) => [item.id, item]));
        const parcelItems = items.map((item) => {
            const orderItem = orderItems.get(item.line_item_id);
            return toParcelItem({
                title: item.title ?? orderItem?.title,
                quantity: Number(item.quantity ?? 1),
                variant: orderItem?.variant,
            });
        });
        const itemsValue = items.reduce((sum, item) => {
            const orderItem = orderItems.get(item.line_item_id);
            return sum + Number(orderItem?.unit_price ?? 0) * Number(item.quantity ?? 0);
        }, 0);
        try {
            const created = await (0, shipments_1.createShipment)({
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
                    displayId: order?.display_id,
                    orderId: order?.id,
                },
            });
            this.logger_.info(`[apaczka] Created order ${created.state.order_id} (${created.state.service_name}) for Medusa order ${order?.id ?? "-"}`);
            return {
                data: { ...shippingData, apaczka: created.state },
                labels: created.labels,
            };
        }
        catch (error) {
            throw toMedusaError(error, "Apaczka rejected the shipment");
        }
    }
    async cancelFulfillment(fulfillmentData) {
        const data = (0, data_1.readFulfillmentData)(fulfillmentData);
        const state = data.apaczka;
        if (!state?.order_id || state.state !== "created") {
            return { ...data, apaczka: state ? { ...state, state: "canceled" } : undefined };
        }
        try {
            await this.client_.cancelOrder(state.order_id);
        }
        catch (error) {
            if (error instanceof apaczka_1.ApaczkaApiError) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, `Apaczka could not cancel order ${state.order_id}: ${error.message}. ` +
                    "Parcels already handed to the carrier cannot be canceled.");
            }
            throw toMedusaError(error, `Could not cancel Apaczka order ${state.order_id}`);
        }
        return { ...data, apaczka: { ...state, state: "canceled", status: "canceled" } };
    }
    /**
     * Medusa does not pass the customer's address to this method, so the
     * return label is created right after by the plugin's
     * `order.return_requested` subscriber (or from the order page).
     */
    async createReturnFulfillment(fromData) {
        const shippingOption = (fromData.shipping_option ?? {});
        const option = (0, fulfillment_options_1.parseFulfillmentOption)(shippingOption.data);
        return this.pending({}, option ? { ...option, is_return: true } : undefined);
    }
    /* ---------------------------------------------------------------------- */
    /* Documents                                                               */
    /* ---------------------------------------------------------------------- */
    // Medusa's base class types these as `Promise<never[]>` / `Promise<void>`; the
    // interface (IFulfillmentProvider) allows `any`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getFulfillmentDocuments(data) {
        return this.documentsFor(data);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getShipmentDocuments(data) {
        return this.documentsFor(data);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getReturnDocuments(data) {
        return this.documentsFor(data);
    }
    /**
     * Returns a document as `{ content (base64), content_type, file_name }`.
     * `documentType`: `label` (or `waybill`) and `dispatch_code`.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async retrieveDocuments(fulfillmentData, documentType) {
        const state = (0, data_1.readFulfillmentData)(fulfillmentData).apaczka;
        if (!state?.order_id) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, "This fulfillment has no Apaczka shipment yet");
        }
        try {
            if (documentType === "dispatch_code") {
                return await this.client_.getDispatchCode(state.order_id);
            }
            const waybill = await this.client_.getWaybill(state.order_id);
            const isZpl = waybill.type?.toLowerCase() === "zpl";
            return {
                content: waybill.waybill,
                content_type: isZpl ? "application/zpl" : "application/pdf",
                file_name: `apaczka-${state.order_id}.${isZpl ? "zpl" : "pdf"}`,
            };
        }
        catch (error) {
            throw toMedusaError(error, `Could not download the ${documentType} for Apaczka order ${state.order_id}`);
        }
    }
    /* ---------------------------------------------------------------------- */
    /* Internals                                                               */
    /* ---------------------------------------------------------------------- */
    requireOption(data) {
        const option = (0, fulfillment_options_1.parseFulfillmentOption)(data);
        if (!option) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Shipping option is not an Apaczka service");
        }
        return option;
    }
    optionForFulfillment(data, order, shippingOptionId) {
        const direct = (0, fulfillment_options_1.parseFulfillmentOption)(data?.[OPTION_KEY]);
        if (direct) {
            return direct;
        }
        const methods = (order
            ?.shipping_methods ?? []);
        const method = methods.find((m) => m.shipping_option_id === shippingOptionId) ?? methods[0];
        return (0, fulfillment_options_1.parseFulfillmentOption)(method?.data?.[OPTION_KEY]);
    }
    warehouseFor(location) {
        return (0, addresses_1.warehouseAddress)({
            location,
            defaults: this.options_.sender,
            overrides: location?.id ? this.options_.senderByLocation[location.id] : undefined,
        });
    }
    /**
     * The provider only gets the stock location ID at fulfillment time. Use
     * the location snapshot taken at checkout when it is the same location,
     * then the per-location overrides and global defaults. The plugin's own
     * workflow passes a fully resolved sender instead
     * (see `ApaczkaAdditionalData.sender`).
     */
    senderForFulfillment(data, locationId) {
        const snapshot = data.location && (!locationId || data.location.id === locationId) ? data.location : null;
        const id = locationId ?? snapshot?.id;
        const address = (0, addresses_1.warehouseAddress)({
            location: snapshot,
            defaults: this.options_.sender,
            overrides: id ? this.options_.senderByLocation[id] : undefined,
        });
        return (0, addresses_1.missingAddressFields)(address).length ? undefined : address;
    }
    pending(data, option, error) {
        const state = {
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
        };
        return { data: { ...data, ...(option ? { [OPTION_KEY]: option } : {}), apaczka: state }, labels: [] };
    }
    documentsFor(data) {
        const state = (0, data_1.readFulfillmentData)(data).apaczka;
        return state ? (0, shipments_1.labelsFor)(state).map((label) => ({ type: "label", url: label.label_url })) : [];
    }
    async lookupPoint(option, pointId, countryCode) {
        let point;
        try {
            point = await this.catalog_.findPoint(option.points_type, pointId, countryCode);
        }
        catch (error) {
            // Never block checkout because the point directory is slow or down.
            this.logger_.warn(`[apaczka] Could not verify point ${pointId}: ${error.message}`);
            return undefined;
        }
        if (!point) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Parcel point ${pointId} was not found for ${option.supplier}. Choose another point.`);
        }
        if (option.cod && point.option_cod === false) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Parcel point ${pointId} does not accept cash on delivery. Choose another point.`);
        }
        if (point.option_deliver === false) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Parcel point ${pointId} does not accept deliveries. Choose another point.`);
        }
        return {
            id: point.foreign_address_id,
            type: point.type,
            name: point.name,
            line1: point.address.line1,
            postal_code: point.address.postal_code,
            city: point.address.city,
            country_code: point.address.country_code,
        };
    }
    /** Valuation calls are cached briefly: checkout prices the same cart many times. */
    async quote(payload, serviceId) {
        const key = JSON.stringify(payload);
        const now = Date.now();
        const cached = this.quotes_.get(key);
        if (cached && now - cached.at < QUOTE_TTL_MS) {
            return cached.value;
        }
        const value = this.client_.valuateOrder(payload).then((valuation) => {
            const entry = valuation.price_table?.[String(serviceId)];
            if (!entry) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, `Apaczka service ${serviceId} cannot carry this parcel (check its weight, size and destination).`);
            }
            return { price: Number(entry.price), price_gross: Number(entry.price_gross) };
        });
        if (this.quotes_.size >= QUOTE_CACHE_SIZE) {
            this.quotes_.delete(this.quotes_.keys().next().value);
        }
        this.quotes_.set(key, { at: now, value });
        value.catch(() => this.quotes_.delete(key));
        return value;
    }
}
exports.ApaczkaFulfillmentProviderService = ApaczkaFulfillmentProviderService;
function toParcelItem(item) {
    return {
        title: item.title,
        quantity: Number(item.quantity ?? 1),
        weight: item.variant?.weight,
        length: item.variant?.length,
        width: item.variant?.width,
        height: item.variant?.height,
    };
}
function cartSubtotal(items) {
    return items.reduce((sum, item) => {
        const subtotal = Number(item.subtotal);
        return sum + (Number.isFinite(subtotal) ? subtotal : Number(item.unit_price ?? 0) * Number(item.quantity ?? 0));
    }, 0);
}
function orderEmail(order) {
    const candidate = order;
    return candidate?.email ?? candidate?.customer?.email ?? undefined;
}
/** Converts client errors into MedusaErrors with a readable message. */
function toMedusaError(error, context) {
    if (error instanceof utils_1.MedusaError) {
        return error;
    }
    if (error instanceof apaczka_1.ApaczkaApiError) {
        const type = error.isAuthenticationError ? utils_1.MedusaError.Types.UNAUTHORIZED : utils_1.MedusaError.Types.INVALID_DATA;
        return new utils_1.MedusaError(type, `${context}: ${error.message}`);
    }
    if (error instanceof apaczka_1.ApaczkaError) {
        return new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, `${context}: ${error.message}`);
    }
    return new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, `${context}: ${error?.message ?? error}`);
}
function stripId(value) {
    if (!value) {
        return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = value;
    return rest;
}
exports.default = ApaczkaFulfillmentProviderService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvYXBhY3prYS9zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXlsQkEsc0NBWUM7QUF6bEJELHFEQUEyRjtBQUUzRiwrQ0FBcUc7QUFDckcsbURBQW9IO0FBQ3BILCtDQUFrRDtBQUNsRCx5Q0FPdUI7QUFDdkIsdUVBSXNDO0FBQ3RDLDJDQUFrRDtBQUNsRCwyREFBMkQ7QUFDM0QsK0NBQWdHO0FBRWhHLG1EQUErRDtBQUMvRCwrQ0FBNkM7QUFhN0MsdUdBQXVHO0FBQ3ZHLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFBO0FBRW5DLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQTtBQUMzQixNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQTtBQUU1Qjs7Ozs7Ozs7Ozs7Ozs7O0dBZUc7QUFDSCxNQUFhLGlDQUFrQyxTQUFRLDBDQUFrQztJQUN2RixNQUFNLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQTtJQUVWLE9BQU8sQ0FBUTtJQUNmLFFBQVEsQ0FBc0I7SUFDOUIsT0FBTyxDQUFlO0lBQ3RCLFFBQVEsQ0FBZ0I7SUFDMUIsT0FBTyxHQUFHLElBQUksR0FBRyxFQUFrRixDQUFBO0lBRXBILE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBZ0M7UUFDckQsSUFBQSx3QkFBYyxFQUFDLE9BQU8sQ0FBQyxDQUFBO0lBQ3pCLENBQUM7SUFFRCxZQUFZLEVBQUUsTUFBTSxFQUF3QixFQUFFLE9BQWdDO1FBQzVFLEtBQUssRUFBRSxDQUFBO1FBQ1AsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUE7UUFDckIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFBLHdCQUFjLEVBQUMsT0FBTyxDQUFDLENBQUE7UUFDdkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLHVCQUFhLENBQUM7WUFDL0IsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSztZQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTO1lBQ2xDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDdEMsT0FBTyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTztZQUM5QixTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTO1lBQ2xDLFVBQVUsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVU7WUFDcEMsU0FBUyxFQUFFLElBQUEsbUJBQVMsR0FBRTtZQUN0QixNQUFNO1NBQ1AsQ0FBQyxDQUFBO1FBQ0YsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLHdCQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUMvQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLDBCQUEwQixHQUFHLE1BQU07WUFDeEUsV0FBVyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEdBQUcsTUFBTTtZQUNwRCxNQUFNO1NBQ1AsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUVELDRFQUE0RTtJQUM1RSw2RUFBNkU7SUFDN0UsNEVBQTRFO0lBRTVFLEtBQUssQ0FBQyxxQkFBcUI7UUFDekIsSUFBSSxDQUFDO1lBQ0gsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLENBQUE7WUFDM0QsT0FBTyxJQUFBLDZDQUF1QixFQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDMUQsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLGFBQWEsQ0FBQyxLQUFLLEVBQUUsc0NBQXNDLENBQUMsQ0FBQTtRQUNwRSxDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBNkI7UUFDaEQsT0FBTyxJQUFBLDRDQUFzQixFQUFDLElBQUksQ0FBQyxLQUFLLFNBQVMsQ0FBQTtJQUNuRCxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUE2QjtRQUM5QyxPQUFPLElBQUEsNENBQXNCLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLFNBQVMsQ0FBQTtJQUN4RCxDQUFDO0lBRUQsNEVBQTRFO0lBQzVFLDZFQUE2RTtJQUM3RSw0RUFBNEU7SUFFNUU7Ozs7T0FJRztJQUNILEtBQUssQ0FBQyx1QkFBdUIsQ0FDM0IsVUFBbUMsRUFDbkMsSUFBNkIsRUFDN0IsT0FBdUM7UUFFdkMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQTtRQUM3QyxNQUFNLE9BQU8sR0FBRyxPQUFPLElBQUksRUFBRSxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUE7UUFFckYsSUFBSSxNQUFNLENBQUMsV0FBVyxLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNwRSxNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUM5QixHQUFHLE1BQU0sQ0FBQyxJQUFJLDBFQUEwRSxDQUN6RixDQUFBO1FBQ0gsQ0FBQztRQUVELElBQUksS0FBdUMsQ0FBQTtRQUMzQyxJQUFJLE9BQU8sSUFBSSxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEMsS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxZQUFZLElBQUksSUFBSSxDQUFDLENBQUE7UUFDakcsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUE7UUFDdEMsT0FBTztZQUNMLEdBQUcsSUFBSTtZQUNQLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDekMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzNCLFdBQVcsRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUN6Qix3RUFBd0U7WUFDeEUsa0NBQWtDO1lBQ2xDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRTtnQkFDZCxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFO2dCQUM1RixDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ1AsQ0FBQyxVQUFVLENBQUMsRUFBRSxNQUFNO1NBQ3JCLENBQUE7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FDbEIsVUFBeUQsRUFDekQsSUFBNkMsRUFDN0MsT0FBbUQ7UUFFbkQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQTtRQUM3QyxNQUFNLE9BQU8sR0FBRyxJQUFBLDJCQUFpQixFQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sQ0FBQTtRQUMzRSxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUUsT0FBc0MsQ0FBQyxhQUFhLElBQUksS0FBSyxDQUFDLENBQUE7UUFDM0YsTUFBTSxLQUFLLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBbUIsQ0FBQTtRQUVyRCxJQUFJLENBQUM7WUFDSCxNQUFNLFFBQVEsR0FBRyxJQUFBLDJCQUFlLEVBQzlCLE9BQU8sQ0FBQyxnQkFBeUIsRUFDaEMsT0FBOEIsQ0FBQyxLQUFLLEVBQ3JDLE9BQU8sSUFBSSxFQUFFLFFBQVEsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FDL0QsQ0FBQTtZQUNELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQW9CLEVBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUE7WUFDbEYsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ25CLE1BQU0sSUFBSSxtQkFBVyxDQUNuQixtQkFBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQzlCLHFDQUFxQyxNQUFNLENBQUMsSUFBSSxjQUFjLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FDckYsQ0FBQTtZQUNILENBQUM7WUFFRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsYUFBNEMsQ0FBQTtZQUNyRSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQWlCLENBQUMsQ0FBQTtZQUV0RCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsaUNBQWlCLEVBQUM7Z0JBQ3RDLE9BQU8sRUFBRSxJQUFJLENBQUMsUUFBUTtnQkFDdEIsTUFBTTtnQkFDTixPQUFPLEVBQUUsV0FBVztnQkFDcEIsU0FBUztnQkFDVCxRQUFRLEVBQUUsRUFBRSxHQUFHLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksSUFBSSxRQUFRLEVBQUU7Z0JBQzFELEtBQUssRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztnQkFDOUIsVUFBVSxFQUFFLFlBQVksQ0FBQyxLQUFLLENBQUM7Z0JBQy9CLFNBQVMsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ3ZELE1BQU0sRUFBRSxPQUFPLENBQUMsRUFBRTthQUNuQixDQUFDLENBQUE7WUFFRixNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQTtZQUUxRCxPQUFPO2dCQUNMLGlCQUFpQixFQUFFLElBQUEsd0JBQWdCLEVBQUM7b0JBQ2xDLEtBQUs7b0JBQ0wsWUFBWTtvQkFDWixPQUFPO29CQUNQLFlBQVksRUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDO2lCQUNsQyxDQUFDO2dCQUNGLGlDQUFpQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLEtBQUssT0FBTzthQUM3RCxDQUFBO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixJQUFJLE9BQU8sQ0FBQyxjQUFjLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3pDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUNmLDRCQUE0QixNQUFNLENBQUMsSUFBSSwwQ0FBMkMsS0FBZSxDQUFDLE9BQU8sRUFBRSxDQUM1RyxDQUFBO2dCQUNELE9BQU87b0JBQ0wsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLGNBQWM7b0JBQ3pDLGlDQUFpQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLEtBQUssT0FBTztpQkFDN0QsQ0FBQTtZQUNILENBQUM7WUFDRCxNQUFNLGFBQWEsQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQzlELENBQUM7SUFDSCxDQUFDO0lBRUQsNEVBQTRFO0lBQzVFLDZFQUE2RTtJQUM3RSw0RUFBNEU7SUFFNUUsS0FBSyxDQUFDLGlCQUFpQixDQUNyQixJQUE2QixFQUM3QixLQUF5RCxFQUN6RCxLQUErQyxFQUMvQyxXQUE0RSxFQUM1RSxjQUF3QztRQUV4QyxNQUFNLFlBQVksR0FBRyxJQUFBLDBCQUFtQixFQUFDLElBQUksQ0FBQyxDQUFBO1FBQzlDLE1BQU0sS0FBSyxHQUFHLENBQUMsY0FBYyxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQTBCLENBQUE7UUFDdEUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLGtCQUFrQixJQUFJLFNBQVMsQ0FBQyxDQUFBO1FBRWxHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsU0FBUyxFQUFFLGtGQUFrRixDQUFDLENBQUE7UUFDbEksQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQy9ELE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUE7UUFDM0MsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLFlBQVksRUFBRSxXQUFXLENBQUMsV0FBVyxJQUFJLFNBQVMsQ0FBQyxDQUFBO1FBQy9HLElBQUksQ0FBQyxTQUFTLElBQUksSUFBQSxnQ0FBb0IsRUFBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN6RCxNQUFNLE1BQU0sR0FDVix3R0FBd0csQ0FBQTtZQUMxRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLE1BQU0saUJBQWlCLFdBQVcsQ0FBQyxFQUFFLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQTtZQUNqRixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUNuRCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBQSwyQkFBZSxFQUM5QixXQUFXLENBQUMsZ0JBQXlCLEVBQ3JDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFDakIsS0FBSyxDQUFDLFNBQVMsRUFBRSxRQUFRLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FDbkQsQ0FBQTtRQUNELElBQUEsaUNBQXFCLEVBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFBO1FBRTNDLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFnQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQzNHLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUNyQyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFzQixDQUFDLENBQUE7WUFDN0QsT0FBTyxZQUFZLENBQUM7Z0JBQ2xCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxJQUFJLFNBQVMsRUFBRSxLQUFLO2dCQUNyQyxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDO2dCQUNwQyxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU87YUFDNUIsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7UUFDRixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO1lBQzVDLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQXNCLENBQUMsQ0FBQTtZQUM3RCxPQUFPLEdBQUcsR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQTtRQUM5RSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7UUFFTCxJQUFJLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsMEJBQWMsRUFBQztnQkFDbkMsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNwQixNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3BCLEtBQUssRUFBRTtvQkFDTCxPQUFPLEVBQUUsSUFBSSxDQUFDLFFBQVE7b0JBQ3RCLE1BQU07b0JBQ04sU0FBUztvQkFDVCxRQUFRO29CQUNSLEtBQUssRUFBRSxXQUFXO29CQUNsQixVQUFVO29CQUNWLFNBQVMsRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssSUFBSSxVQUFVLENBQUM7b0JBQzdDLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztvQkFDMUIsU0FBUyxFQUFHLEtBQTZDLEVBQUUsVUFBVTtvQkFDckUsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFO2lCQUNuQjthQUNGLENBQUMsQ0FBQTtZQUVGLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUNmLDJCQUEyQixPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsS0FBSyxDQUFDLFlBQVksc0JBQXNCLEtBQUssRUFBRSxFQUFFLElBQUksR0FBRyxFQUFFLENBQ3pILENBQUE7WUFFRCxPQUFPO2dCQUNMLElBQUksRUFBRSxFQUFFLEdBQUcsWUFBWSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFtQztnQkFDbEYsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO2FBQ3ZCLENBQUE7UUFDSCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sYUFBYSxDQUFDLEtBQUssRUFBRSwrQkFBK0IsQ0FBQyxDQUFBO1FBQzdELENBQUM7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQixDQUFDLGVBQXdDO1FBQzlELE1BQU0sSUFBSSxHQUFHLElBQUEsMEJBQW1CLEVBQUMsZUFBZSxDQUFDLENBQUE7UUFDakQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQTtRQUUxQixJQUFJLENBQUMsS0FBSyxFQUFFLFFBQVEsSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2xELE9BQU8sRUFBRSxHQUFHLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsS0FBSyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUE7UUFDbEYsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsSUFBSSxLQUFLLFlBQVkseUJBQWUsRUFBRSxDQUFDO2dCQUNyQyxNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUM3QixrQ0FBa0MsS0FBSyxDQUFDLFFBQVEsS0FBSyxLQUFLLENBQUMsT0FBTyxJQUFJO29CQUNwRSwyREFBMkQsQ0FDOUQsQ0FBQTtZQUNILENBQUM7WUFDRCxNQUFNLGFBQWEsQ0FBQyxLQUFLLEVBQUUsa0NBQWtDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFBO1FBQ2hGLENBQUM7UUFFRCxPQUFPLEVBQUUsR0FBRyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsR0FBRyxLQUFLLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQTtJQUNsRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxRQUFpQztRQUM3RCxNQUFNLGNBQWMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUF1QyxDQUFBO1FBQzdGLE1BQU0sTUFBTSxHQUFHLElBQUEsNENBQXNCLEVBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQzFELE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUE7SUFDOUUsQ0FBQztJQUVELDRFQUE0RTtJQUM1RSw2RUFBNkU7SUFDN0UsNEVBQTRFO0lBRTVFLCtFQUErRTtJQUMvRSxpREFBaUQ7SUFDakQsOERBQThEO0lBQzlELEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxJQUE2QjtRQUN6RCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUE7SUFDaEMsQ0FBQztJQUVELDhEQUE4RDtJQUM5RCxLQUFLLENBQUMsb0JBQW9CLENBQUMsSUFBNkI7UUFDdEQsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ2hDLENBQUM7SUFFRCw4REFBOEQ7SUFDOUQsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQTZCO1FBQ3BELE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQTtJQUNoQyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsOERBQThEO0lBQzlELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxlQUF3QyxFQUFFLFlBQW9CO1FBQ3BGLE1BQU0sS0FBSyxHQUFHLElBQUEsMEJBQW1CLEVBQUMsZUFBZSxDQUFDLENBQUMsT0FBTyxDQUFBO1FBQzFELElBQUksQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUM7WUFDckIsTUFBTSxJQUFJLG1CQUFXLENBQUMsbUJBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLDhDQUE4QyxDQUFDLENBQUE7UUFDcEcsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILElBQUksWUFBWSxLQUFLLGVBQWUsRUFBRSxDQUFDO2dCQUNyQyxPQUFPLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQzNELENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQTtZQUM3RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLEtBQUssQ0FBQTtZQUNuRCxPQUFPO2dCQUNMLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTztnQkFDeEIsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtnQkFDM0QsU0FBUyxFQUFFLFdBQVcsS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFO2FBQ2hFLENBQUE7UUFDSCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sYUFBYSxDQUFDLEtBQUssRUFBRSwwQkFBMEIsWUFBWSxzQkFBc0IsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUE7UUFDMUcsQ0FBQztJQUNILENBQUM7SUFFRCw0RUFBNEU7SUFDNUUsNkVBQTZFO0lBQzdFLDRFQUE0RTtJQUVwRSxhQUFhLENBQUMsSUFBYTtRQUNqQyxNQUFNLE1BQU0sR0FBRyxJQUFBLDRDQUFzQixFQUFDLElBQUksQ0FBQyxDQUFBO1FBQzNDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE1BQU0sSUFBSSxtQkFBVyxDQUFDLG1CQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSwyQ0FBMkMsQ0FBQyxDQUFBO1FBQ3BHLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQTtJQUNmLENBQUM7SUFFTyxvQkFBb0IsQ0FDMUIsSUFBNkIsRUFDN0IsS0FBK0MsRUFDL0MsZ0JBQXlCO1FBRXpCLE1BQU0sTUFBTSxHQUFHLElBQUEsNENBQXNCLEVBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQTtRQUN6RCxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1gsT0FBTyxNQUFNLENBQUE7UUFDZixDQUFDO1FBQ0QsTUFBTSxPQUFPLEdBQUcsQ0FBRSxLQUF1RztZQUN2SCxFQUFFLGdCQUFnQixJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQzNCLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsS0FBSyxnQkFBZ0IsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUMzRixPQUFPLElBQUEsNENBQXNCLEVBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUE7SUFDM0QsQ0FBQztJQUVPLFlBQVksQ0FBQyxRQUF5RjtRQUM1RyxPQUFPLElBQUEsNEJBQWdCLEVBQUM7WUFDdEIsUUFBUTtZQUNSLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU07WUFDOUIsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQ2xGLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSyxvQkFBb0IsQ0FBQyxJQUErQixFQUFFLFVBQW1CO1FBQy9FLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBO1FBQ3pHLE1BQU0sRUFBRSxHQUFHLFVBQVUsSUFBSSxRQUFRLEVBQUUsRUFBRSxDQUFBO1FBQ3JDLE1BQU0sT0FBTyxHQUFHLElBQUEsNEJBQWdCLEVBQUM7WUFDL0IsUUFBUSxFQUFFLFFBQVE7WUFDbEIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTTtZQUM5QixTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1NBQy9ELENBQUMsQ0FBQTtRQUNGLE9BQU8sSUFBQSxnQ0FBb0IsRUFBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFBO0lBQ25FLENBQUM7SUFFTyxPQUFPLENBQ2IsSUFBK0IsRUFDL0IsTUFBNEMsRUFDNUMsS0FBYztRQUVkLE1BQU0sS0FBSyxHQUE0QjtZQUNyQyxLQUFLLEVBQUUsU0FBUztZQUNoQixNQUFNLEVBQUUsU0FBUztZQUNqQixVQUFVLEVBQUUsTUFBTSxFQUFFLFVBQVUsSUFBSSxDQUFDO1lBQ25DLFlBQVksRUFBRSxNQUFNLEVBQUUsWUFBWTtZQUNsQyxRQUFRLEVBQUUsTUFBTSxFQUFFLFFBQVE7WUFDMUIsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLElBQUksS0FBSztZQUNyQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsSUFBSSxLQUFLO1lBQ3pCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN2QixZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ3ZDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztTQUM1QixDQUFBO1FBQ0QsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLEdBQUcsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsQ0FBQTtJQUN2RyxDQUFDO0lBRU8sWUFBWSxDQUFDLElBQTZCO1FBQ2hELE1BQU0sS0FBSyxHQUFHLElBQUEsMEJBQW1CLEVBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFBO1FBQy9DLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFBLHFCQUFTLEVBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO0lBQ2hHLENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVyxDQUN2QixNQUFnQyxFQUNoQyxPQUFlLEVBQ2YsV0FBbUI7UUFFbkIsSUFBSSxLQUFLLENBQUE7UUFDVCxJQUFJLENBQUM7WUFDSCxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBWSxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQTtRQUNsRixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLG9FQUFvRTtZQUNwRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsT0FBTyxLQUFNLEtBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFBO1lBQzdGLE9BQU8sU0FBUyxDQUFBO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWCxNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUM5QixnQkFBZ0IsT0FBTyxzQkFBc0IsTUFBTSxDQUFDLFFBQVEseUJBQXlCLENBQ3RGLENBQUE7UUFDSCxDQUFDO1FBQ0QsSUFBSSxNQUFNLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDN0MsTUFBTSxJQUFJLG1CQUFXLENBQ25CLG1CQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFDOUIsZ0JBQWdCLE9BQU8sMERBQTBELENBQ2xGLENBQUE7UUFDSCxDQUFDO1FBQ0QsSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ25DLE1BQU0sSUFBSSxtQkFBVyxDQUNuQixtQkFBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQzlCLGdCQUFnQixPQUFPLG9EQUFvRCxDQUM1RSxDQUFBO1FBQ0gsQ0FBQztRQUVELE9BQU87WUFDTCxFQUFFLEVBQUUsS0FBSyxDQUFDLGtCQUFrQjtZQUM1QixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDaEIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2hCLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUs7WUFDMUIsV0FBVyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVztZQUN0QyxJQUFJLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJO1lBQ3hCLFlBQVksRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLFlBQVk7U0FDekMsQ0FBQTtJQUNILENBQUM7SUFFRCxvRkFBb0Y7SUFDNUUsS0FBSyxDQUFDLEtBQUssQ0FDakIsT0FBc0QsRUFDdEQsU0FBaUI7UUFFakIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNuQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7UUFDdEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDcEMsSUFBSSxNQUFNLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsWUFBWSxFQUFFLENBQUM7WUFDN0MsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFBO1FBQ3JCLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRTtZQUNsRSxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUE7WUFDeEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNYLE1BQU0sSUFBSSxtQkFBVyxDQUNuQixtQkFBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQzdCLG1CQUFtQixTQUFTLHFFQUFxRSxDQUNsRyxDQUFBO1lBQ0gsQ0FBQztZQUNELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFBO1FBQy9FLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1lBQzFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBZSxDQUFDLENBQUE7UUFDakUsQ0FBQztRQUNELElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTtRQUN6QyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFDM0MsT0FBTyxLQUFLLENBQUE7SUFDZCxDQUFDOztBQS9kSCw4RUFnZUM7QUEyQkQsU0FBUyxZQUFZLENBQUMsSUFBa0Y7SUFDdEcsT0FBTztRQUNMLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU07UUFDNUIsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTTtRQUM1QixLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLO1FBQzFCLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU07S0FDN0IsQ0FBQTtBQUNILENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxLQUFxQjtJQUN6QyxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDaEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUN0QyxPQUFPLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNqSCxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7QUFDUCxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsS0FBK0M7SUFDakUsTUFBTSxTQUFTLEdBQUcsS0FBc0UsQ0FBQTtJQUN4RixPQUFPLFNBQVMsRUFBRSxLQUFLLElBQUksU0FBUyxFQUFFLFFBQVEsRUFBRSxLQUFLLElBQUksU0FBUyxDQUFBO0FBQ3BFLENBQUM7QUFFRCx3RUFBd0U7QUFDeEUsU0FBZ0IsYUFBYSxDQUFDLEtBQWMsRUFBRSxPQUFlO0lBQzNELElBQUksS0FBSyxZQUFZLG1CQUFXLEVBQUUsQ0FBQztRQUNqQyxPQUFPLEtBQUssQ0FBQTtJQUNkLENBQUM7SUFDRCxJQUFJLEtBQUssWUFBWSx5QkFBZSxFQUFFLENBQUM7UUFDckMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLG1CQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQTtRQUMxRyxPQUFPLElBQUksbUJBQVcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxPQUFPLEtBQUssS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7SUFDOUQsQ0FBQztJQUNELElBQUksS0FBSyxZQUFZLHNCQUFZLEVBQUUsQ0FBQztRQUNsQyxPQUFPLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLE9BQU8sS0FBSyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQTtJQUM1RixDQUFDO0lBQ0QsT0FBTyxJQUFJLG1CQUFXLENBQUMsbUJBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxPQUFPLEtBQU0sS0FBZSxFQUFFLE9BQU8sSUFBSSxLQUFLLEVBQUUsQ0FBQyxDQUFBO0FBQ2pILENBQUM7QUFFRCxTQUFTLE9BQU8sQ0FBNkIsS0FBMkI7SUFDdEUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1gsT0FBTyxJQUFJLENBQUE7SUFDYixDQUFDO0lBQ0QsNkRBQTZEO0lBQzdELE1BQU0sRUFBRSxFQUFFLEVBQUUsR0FBRyxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUE7SUFDN0IsT0FBTyxJQUFJLENBQUE7QUFDYixDQUFDO0FBRUQsa0JBQWUsaUNBQWlDLENBQUEifQ==