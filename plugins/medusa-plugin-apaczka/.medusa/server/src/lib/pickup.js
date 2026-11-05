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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlja3VwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2xpYi9waWNrdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFjQSxzQ0FzQ0M7QUFFRCxnQ0FLQztBQXZERDs7Ozs7Ozs7O0dBU0c7QUFDSSxLQUFLLFVBQVUsYUFBYSxDQUFDLEtBUW5DO0lBQ0MsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUE7SUFDaEMsTUFBTSxZQUFZLEdBQ2hCLE1BQU0sQ0FBQyxjQUFjLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQTtJQUUzRixJQUFJLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssT0FBTyxFQUFFLENBQUM7UUFDL0MsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQTtJQUN6QixDQUFDO0lBRUQsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUE7SUFDbEYsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFBO0lBRTFELElBQUksSUFBSSxHQUFHLFlBQVksQ0FBQTtJQUN2QixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQztZQUNqRCxXQUFXLEVBQUUsS0FBSyxDQUFDLGdCQUFnQjtZQUNuQyxVQUFVLEVBQUUsS0FBSyxDQUFDLFNBQVM7U0FDNUIsQ0FBQyxDQUFBO1FBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSTthQUNuQixHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7YUFDdEIsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQzVDLElBQUksRUFBRSxDQUFBO1FBQ1QsSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUE7SUFDckMsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixLQUFLLENBQUMsTUFBTSxFQUFFLElBQUksQ0FDaEIsOENBQThDLEtBQUssQ0FBQyxnQkFBZ0IsV0FBVyxZQUFZLEtBQU0sS0FBZSxDQUFDLE9BQU8sRUFBRSxDQUMzSCxDQUFBO0lBQ0gsQ0FBQztJQUVELE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFBO0FBQzFGLENBQUM7QUFFRCxTQUFnQixVQUFVLENBQUMsSUFBVTtJQUNuQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUE7SUFDNUIsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ3RELE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ2pELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFBO0FBQ3pCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxJQUFVO0lBQzVCLE9BQU8sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQTtBQUN0RSxDQUFDO0FBRUQsU0FBUyxPQUFPLENBQUMsSUFBVSxFQUFFLElBQVk7SUFDdkMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7SUFDM0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUE7SUFDbkMsT0FBTyxJQUFJLENBQUE7QUFDYixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsSUFBVTtJQUNqQyxNQUFNLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtJQUMzQixPQUFPLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2xELElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFBO0lBQ2xDLENBQUM7SUFDRCxPQUFPLElBQUksQ0FBQTtBQUNiLENBQUMifQ==