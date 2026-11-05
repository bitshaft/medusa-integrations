"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitEventsStep = exports.emitEventsStepId = void 0;
const utils_1 = require("@medusajs/framework/utils");
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
exports.emitEventsStepId = "apaczka-emit-events";
/**
 * Emits several events whose names are only known at runtime. Like Medusa's
 * `emitEventStep`, events join the workflow's event group, so they are
 * released only if the workflow succeeds.
 */
exports.emitEventsStep = (0, workflows_sdk_1.createStep)(exports.emitEventsStepId, async (events, context) => {
    if (!events?.length) {
        return new workflows_sdk_1.StepResponse(undefined);
    }
    const eventBus = context.container.resolve(utils_1.Modules.EVENT_BUS);
    const metadata = context.eventGroupId ? { eventGroupId: context.eventGroupId } : {};
    await eventBus.emit(events.map((event) => ({ name: event.name, data: event.data, metadata })));
    return new workflows_sdk_1.StepResponse(undefined, {
        eventGroupId: context.eventGroupId,
        eventNames: events.map((event) => event.name),
    });
}, async (compensation, context) => {
    if (!compensation?.eventGroupId) {
        return;
    }
    const eventBus = context.container.resolve(utils_1.Modules.EVENT_BUS);
    await eventBus.clearGroupedEvents(compensation.eventGroupId, { eventNames: compensation.eventNames });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1pdC1ldmVudHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvd29ya2Zsb3dzL3N0ZXBzL2VtaXQtZXZlbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHFEQUFtRDtBQUNuRCxxRUFBNEU7QUFJL0QsUUFBQSxnQkFBZ0IsR0FBRyxxQkFBcUIsQ0FBQTtBQUVyRDs7OztHQUlHO0FBQ1UsUUFBQSxjQUFjLEdBQUcsSUFBQSwwQkFBVSxFQUN0Qyx3QkFBZ0IsRUFDaEIsS0FBSyxFQUFFLE1BQXVCLEVBQUUsT0FBTyxFQUFFLEVBQUU7SUFDekMsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUNwQixPQUFPLElBQUksNEJBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQTtJQUNwQyxDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLFNBQVMsQ0FBQyxDQUFBO0lBQzdELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO0lBRW5GLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFFOUYsT0FBTyxJQUFJLDRCQUFZLENBQUMsU0FBUyxFQUFFO1FBQ2pDLFlBQVksRUFBRSxPQUFPLENBQUMsWUFBWTtRQUNsQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztLQUM5QyxDQUFDLENBQUE7QUFDSixDQUFDLEVBQ0QsS0FBSyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsRUFBRTtJQUM5QixJQUFJLENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxDQUFDO1FBQ2hDLE9BQU07SUFDUixDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLFNBQVMsQ0FBQyxDQUFBO0lBQzdELE1BQU0sUUFBUSxDQUFDLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUE7QUFDdkcsQ0FBQyxDQUNGLENBQUEifQ==