"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toGrosze = toGrosze;
exports.fromGrosze = fromGrosze;
exports.decimalStringToGrosze = decimalStringToGrosze;
exports.priceForCustomer = priceForCustomer;
exports.exchangeRate = exchangeRate;
const utils_1 = require("@medusajs/framework/utils");
/** Medusa amounts are decimals in major units; Apaczka uses integer grosze. */
function toGrosze(amount) {
    const value = Number(typeof amount === "object" && amount !== null ? amount.toString() : amount);
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round(value * 100);
}
function fromGrosze(grosze) {
    return Math.round(grosze) / 100;
}
/** Parses Apaczka's decimal price strings (`"12.20"`) into grosze. */
function decimalStringToGrosze(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}
/**
 * Turns an Apaczka quote (grosze, PLN) into the amount charged to the
 * customer (major units, cart currency), applying markups, rounding and the
 * free-shipping threshold.
 */
function priceForCustomer(input) {
    const { pricing } = input;
    if (pricing.freeShippingThreshold !== undefined &&
        input.cartSubtotal !== undefined &&
        input.cartSubtotal >= pricing.freeShippingThreshold) {
        return 0;
    }
    const basePln = fromGrosze(pricing.basis === "net" ? input.quote.price : input.quote.price_gross);
    const converted = basePln * exchangeRate(input.currencyCode, pricing.exchangeRates);
    let amount = converted * (1 + pricing.markupPercent / 100) + pricing.markupFixed;
    if (pricing.roundUpTo) {
        // Work in cents to avoid float drift like 12.000000001 → 13.
        const step = Math.round(pricing.roundUpTo * 100);
        amount = (Math.ceil(Math.round(amount * 100) / step) * step) / 100;
    }
    return Math.max(0, Math.round(amount * 100) / 100);
}
function exchangeRate(currencyCode, rates) {
    const code = currencyCode.toLowerCase();
    if (code === "pln") {
        return 1;
    }
    const rate = rates[code] ?? rates[code.toUpperCase()];
    if (!rate) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Apaczka prices are in PLN, but the cart is in ${code.toUpperCase()}. ` +
            `Add pricing.exchangeRates.${code} to the plugin options, or use flat-rate shipping options for this currency.`);
    }
    return rate;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uZXkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvbGliL21vbmV5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBS0EsNEJBTUM7QUFFRCxnQ0FFQztBQUdELHNEQU1DO0FBT0QsNENBNEJDO0FBRUQsb0NBY0M7QUEzRUQscURBQXVEO0FBSXZELCtFQUErRTtBQUMvRSxTQUFnQixRQUFRLENBQUMsTUFBbUU7SUFDMUYsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sTUFBTSxLQUFLLFFBQVEsSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQ2hHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDNUIsT0FBTyxDQUFDLENBQUE7SUFDVixDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQTtBQUNoQyxDQUFDO0FBRUQsU0FBZ0IsVUFBVSxDQUFDLE1BQWM7SUFDdkMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQTtBQUNqQyxDQUFDO0FBRUQsc0VBQXNFO0FBQ3RFLFNBQWdCLHFCQUFxQixDQUFDLEtBQXlDO0lBQzdFLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssU0FBUyxJQUFJLEtBQUssS0FBSyxFQUFFLEVBQUUsQ0FBQztRQUMxRCxPQUFPLElBQUksQ0FBQTtJQUNiLENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQTtJQUN0RCxPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDbEUsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFnQixnQkFBZ0IsQ0FBQyxLQU1oQztJQUNDLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxLQUFLLENBQUE7SUFFekIsSUFDRSxPQUFPLENBQUMscUJBQXFCLEtBQUssU0FBUztRQUMzQyxLQUFLLENBQUMsWUFBWSxLQUFLLFNBQVM7UUFDaEMsS0FBSyxDQUFDLFlBQVksSUFBSSxPQUFPLENBQUMscUJBQXFCLEVBQ25ELENBQUM7UUFDRCxPQUFPLENBQUMsQ0FBQTtJQUNWLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQ2pHLE1BQU0sU0FBUyxHQUFHLE9BQU8sR0FBRyxZQUFZLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUE7SUFFbkYsSUFBSSxNQUFNLEdBQUcsU0FBUyxHQUFHLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxhQUFhLEdBQUcsR0FBRyxDQUFDLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQTtJQUNoRixJQUFJLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUN0Qiw2REFBNkQ7UUFDN0QsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxDQUFBO1FBQ2hELE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFBO0lBQ3BFLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFBO0FBQ3BELENBQUM7QUFFRCxTQUFnQixZQUFZLENBQUMsWUFBb0IsRUFBRSxLQUE2QjtJQUM5RSxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsV0FBVyxFQUFFLENBQUE7SUFDdkMsSUFBSSxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7UUFDbkIsT0FBTyxDQUFDLENBQUE7SUFDVixDQUFDO0lBQ0QsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQTtJQUNyRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDVixNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUM5QixpREFBaUQsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJO1lBQ3JFLDZCQUE2QixJQUFJLDhFQUE4RSxDQUNsSCxDQUFBO0lBQ0gsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFBO0FBQ2IsQ0FBQyJ9