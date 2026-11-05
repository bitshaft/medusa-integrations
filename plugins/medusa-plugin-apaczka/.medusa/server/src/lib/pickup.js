"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePickup = resolvePickup;
exports.formatDate = formatDate;
/**
 * Decides how the parcel reaches the carrier.
 *
 * - Services that require a courier (`pickup_courier = 2`) always get one.
 * - Services without courier pickup (`0`) are always `SELF`.
 * - Otherwise the configured `pickup.type` wins.
 *
 * For a courier, the first available day from `pickup_hours` (at least
 * `minDaysAhead` days out) is used with the configured time window.
 */
async function resolvePickup(input) {
    const { option, pickup } = input;
    const wantsCourier = option.pickup_courier === 2 || (option.pickup_courier === 1 && pickup.type === "COURIER");
    if (!wantsCourier || option.origin === "point") {
        return { type: "SELF" };
    }
    const earliest = addDays(startOfDay(input.now ?? new Date()), pickup.minDaysAhead);
    const fallbackDate = formatDate(nextBusinessDay(earliest));
    let date = fallbackDate;
    try {
        const { days } = await input.client.getPickupHours({
            postal_code: input.senderPostalCode,
            service_id: input.serviceId,
        });
        const available = days
            .map((day) => day.date)
            .filter((day) => day >= formatDate(earliest))
            .sort();
        date = available[0] ?? fallbackDate;
    }
    catch (error) {
        input.logger?.warn(`[apaczka] Could not fetch pickup hours for ${input.senderPostalCode}; using ${fallbackDate}: ${error.message}`);
    }
    return { type: "COURIER", date, hours_from: pickup.hoursFrom, hours_to: pickup.hoursTo };
}
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}
function nextBusinessDay(date) {
    const copy = new Date(date);
    while (copy.getDay() === 0 || copy.getDay() === 6) {
        copy.setDate(copy.getDate() + 1);
    }
    return copy;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlja3VwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2xpYi9waWNrdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFjQSxzQ0FxQ0M7QUFFRCxnQ0FLQztBQXRERDs7Ozs7Ozs7O0dBU0c7QUFDSSxLQUFLLFVBQVUsYUFBYSxDQUFDLEtBUW5DO0lBQ0MsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUE7SUFDaEMsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLGNBQWMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFBO0lBRTlHLElBQUksQ0FBQyxZQUFZLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQztRQUMvQyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFBO0lBQ3pCLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQTtJQUNsRixNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUE7SUFFMUQsSUFBSSxJQUFJLEdBQUcsWUFBWSxDQUFBO0lBQ3ZCLElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDO1lBQ2pELFdBQVcsRUFBRSxLQUFLLENBQUMsZ0JBQWdCO1lBQ25DLFVBQVUsRUFBRSxLQUFLLENBQUMsU0FBUztTQUM1QixDQUFDLENBQUE7UUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJO2FBQ25CLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQzthQUN0QixNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDNUMsSUFBSSxFQUFFLENBQUE7UUFDVCxJQUFJLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FBQTtJQUNyQyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUNoQiw4Q0FBOEMsS0FBSyxDQUFDLGdCQUFnQixXQUFXLFlBQVksS0FBTSxLQUFlLENBQUMsT0FBTyxFQUFFLENBQzNILENBQUE7SUFDSCxDQUFDO0lBRUQsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUE7QUFDMUYsQ0FBQztBQUVELFNBQWdCLFVBQVUsQ0FBQyxJQUFVO0lBQ25DLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQTtJQUM1QixNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDdEQsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDakQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUE7QUFDekIsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLElBQVU7SUFDNUIsT0FBTyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFBO0FBQ3RFLENBQUM7QUFFRCxTQUFTLE9BQU8sQ0FBQyxJQUFVLEVBQUUsSUFBWTtJQUN2QyxNQUFNLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtJQUMzQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQTtJQUNuQyxPQUFPLElBQUksQ0FBQTtBQUNiLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxJQUFVO0lBQ2pDLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQzNCLE9BQU8sSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDbEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUE7SUFDbEMsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFBO0FBQ2IsQ0FBQyJ9