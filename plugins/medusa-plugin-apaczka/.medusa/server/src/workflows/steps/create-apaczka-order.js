"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApaczkaOrderStep = exports.createApaczkaOrderStepId = void 0;
const utils_1 = require("@medusajs/framework/utils");
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const addresses_1 = require("../../lib/addresses");
const shipments_1 = require("../../lib/shipments");
const apaczka_1 = require("../../modules/apaczka");
exports.createApaczkaOrderStepId = "apaczka-create-order";
/**
 * Sends the order to Apaczka. If a later step fails, the order is canceled
 * so no orphaned shipment is left behind.
 */
exports.createApaczkaOrderStep = (0, workflows_sdk_1.createStep)(exports.createApaczkaOrderStepId, async (input, { container }) => {
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const options = apaczka.getOptions();
    const { context } = input;
    if (context.canceled) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, `Fulfillment ${context.fulfillment_id} is canceled`);
    }
    if (context.data.apaczka?.state === "created" && context.data.apaczka.order_id) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, `Fulfillment ${context.fulfillment_id} already has Apaczka order ${context.data.apaczka.order_id}`);
    }
    const warehouse = input.sender ??
        (0, addresses_1.warehouseAddress)({
            location: context.location,
            defaults: options.sender,
            overrides: context.location_id ? options.senderByLocation[context.location_id] : undefined,
        });
    (0, addresses_1.assertCompleteAddress)(warehouse, context.option.is_return ? "receiver" : "sender");
    const customer = (0, addresses_1.customerAddress)(context.customer_address, context.email, context.option.is_return ? undefined : (input.overrides?.point_id ?? context.data.point_id));
    (0, addresses_1.assertCompleteAddress)(customer, context.option.is_return ? "sender" : "receiver");
    const itemsValue = context.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const created = await (0, shipments_1.createShipment)({
        client: apaczka.getClient(),
        logger,
        build: {
            options,
            option: context.option,
            warehouse,
            customer,
            items: context.items.map((item) => ({
                title: item.title,
                quantity: item.quantity,
                weight: item.variant?.weight,
                length: item.variant?.length,
                width: item.variant?.width,
                height: item.variant?.height,
            })),
            itemsValue,
            codAmount: context.order_total || itemsValue,
            overrides: input.overrides,
            displayId: context.display_id ?? undefined,
            orderId: context.order_id ?? undefined,
        },
    });
    logger.info(`[apaczka] Created order ${created.state.order_id} for fulfillment ${context.fulfillment_id}` +
        (context.option.is_return ? " (return)" : ""));
    return new workflows_sdk_1.StepResponse(created, created.state.order_id ?? 0);
}, async (apaczkaOrderId, { container }) => {
    if (!apaczkaOrderId) {
        return;
    }
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    try {
        await apaczka.getClient().cancelOrder(apaczkaOrderId);
        logger.warn(`[apaczka] Rolled back: canceled Apaczka order ${apaczkaOrderId}`);
    }
    catch (error) {
        logger.error(`[apaczka] Rollback failed: cancel Apaczka order ${apaczkaOrderId} manually in the Apaczka panel (${error.message})`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWFwYWN6a2Etb3JkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvd29ya2Zsb3dzL3N0ZXBzL2NyZWF0ZS1hcGFjemthLW9yZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHFEQUFrRjtBQUNsRixxRUFBNEU7QUFFNUUsbURBQThGO0FBRzlGLG1EQUEwRTtBQUMxRSxtREFBc0Q7QUFXekMsUUFBQSx3QkFBd0IsR0FBRyxzQkFBc0IsQ0FBQTtBQUU5RDs7O0dBR0c7QUFDVSxRQUFBLHNCQUFzQixHQUFHLElBQUEsMEJBQVUsRUFDOUMsZ0NBQXdCLEVBQ3hCLEtBQUssRUFBRSxLQUFrQyxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRTtJQUMxRCxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUF1Qix3QkFBYyxDQUFDLENBQUE7SUFDdkUsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBUyxpQ0FBeUIsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUMxRSxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUE7SUFDcEMsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLEtBQUssQ0FBQTtJQUV6QixJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNyQixNQUFNLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsZUFBZSxPQUFPLENBQUMsY0FBYyxjQUFjLENBQUMsQ0FBQTtJQUMzRyxDQUFDO0lBQ0QsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLEtBQUssU0FBUyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQy9FLE1BQU0sSUFBSSxtQkFBVyxDQUNuQixtQkFBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQzdCLGVBQWUsT0FBTyxD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