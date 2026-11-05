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
    const options = await apaczka.getOptions();
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
        client: await apaczka.getClient(),
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
        await (await apaczka.getClient()).cancelOrder(apaczkaOrderId);
        logger.warn(`[apaczka] Rolled back: canceled Apaczka order ${apaczkaOrderId}`);
    }
    catch (error) {
        logger.error(`[apaczka] Rollback failed: cancel Apaczka order ${apaczkaOrderId} manually in the Apaczka panel (${error.message})`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWFwYWN6a2Etb3JkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvd29ya2Zsb3dzL3N0ZXBzL2NyZWF0ZS1hcGFjemthLW9yZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHFEQUFrRjtBQUNsRixxRUFBNEU7QUFFNUUsbURBQThGO0FBRzlGLG1EQUEwRTtBQUMxRSxtREFBc0Q7QUFXekMsUUFBQSx3QkFBd0IsR0FBRyxzQkFBc0IsQ0FBQTtBQUU5RDs7O0dBR0c7QUFDVSxRQUFBLHNCQUFzQixHQUFHLElBQUEsMEJBQVUsRUFDOUMsZ0NBQXdCLEVBQ3hCLEtBQUssRUFBRSxLQUFrQyxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRTtJQUMxRCxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUF1Qix3QkFBYyxDQUFDLENBQUE7SUFDdkUsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBUyxpQ0FBeUIsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUMxRSxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQTtJQUMxQyxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsS0FBSyxDQUFBO0lBRXpCLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3JCLE1BQU0sSUFBSSxtQkFBVyxDQUFDLG1CQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxlQUFlLE9BQU8sQ0FBQyxjQUFjLGNBQWMsQ0FBQyxDQUFBO0lBQzNHLENBQUM7SUFDRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssS0FBSyxTQUFTLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDL0UsTUFBTSxJQUFJLG1CQUFXLENBQ25CLG1CQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFDN0IsZUFBZSxP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