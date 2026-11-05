"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = apaczkaRefreshServices;
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = require("../lib/apaczka");
const apaczka_2 = require("../modules/apaczka");
/**
 * Refreshes the cached service structure once a day, as Apaczka recommends,
 * so new or removed carriers show up without a restart.
 */
async function apaczkaRefreshServices(container) {
    const apaczka = container.resolve(apaczka_2.APACZKA_MODULE);
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    try {
        const structure = await apaczka.getCatalog().getServiceStructure({ refresh: true });
        logger.info(`[apaczka] Service structure refreshed: ${(0, apaczka_1.listServices)(structure).length} services`);
    }
    catch (error) {
        logger.warn(`[apaczka] Could not refresh the service structure: ${error.message}`);
    }
}
exports.config = {
    name: "apaczka-refresh-services",
    schedule: "15 4 * * *",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBhY3prYS1yZWZyZXNoLXNlcnZpY2VzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2pvYnMvYXBhY3prYS1yZWZyZXNoLXNlcnZpY2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQVdBLHlDQVVDO0FBcEJELHFEQUFxRTtBQUVyRSw0Q0FBNkM7QUFDN0MsZ0RBQW1EO0FBR25EOzs7R0FHRztBQUNZLEtBQUssVUFBVSxzQkFBc0IsQ0FBQyxTQUEwQjtJQUM3RSxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUF1Qix3QkFBYyxDQUFDLENBQUE7SUFDdkUsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUVsRSxJQUFJLENBQUM7UUFDSCxNQUFNLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQ25GLE1BQU0sQ0FBQyxJQUFJLENBQUMsMENBQTBDLElBQUEsc0JBQVksRUFBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLFdBQVcsQ0FBQyxDQUFBO0lBQ2xHLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLElBQUksQ0FBQyxzREFBdUQsS0FBZSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7SUFDL0YsQ0FBQztBQUNILENBQUM7QUFFWSxRQUFBLE1BQU0sR0FBRztJQUNwQixJQUFJLEVBQUUsMEJBQTBCO0lBQ2hDLFFBQVEsRUFBRSxZQUFZO0NBQ3ZCLENBQUEifQ==