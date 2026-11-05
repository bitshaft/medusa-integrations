"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseApaczkaTimestamp = parseApaczkaTimestamp;
const WARSAW = "Europe/Warsaw";
/**
 * Parses `YYYY-MM-DDTHH:mm:ss` (or with a space) as Europe/Warsaw local
 * time — the format Apaczka uses in webhooks. Strings that already carry an
 * offset or `Z` are parsed as-is. Returns `undefined` for invalid input.
 */
function parseApaczkaTimestamp(value) {
    if (!value) {
        return undefined;
    }
    const text = value.trim();
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
        const date = new Date(text);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
    if (!match) {
        return undefined;
    }
    const [, y, mo, d, h, mi, s = "0"] = match;
    const wallClockUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    // Shift by Warsaw's offset at that moment; a second pass settles DST edges.
    let utc = wallClockUtc - offsetMs(wallClockUtc);
    utc = wallClockUtc - offsetMs(utc);
    return new Date(utc);
}
/** Offset of Europe/Warsaw from UTC at the given instant, in ms. */
function offsetMs(instant) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: WARSAW,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(new Date(instant));
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - Math.floor(instant / 1000) * 1000;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGltZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvdGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQU9BLHNEQXNCQztBQTdCRCxNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUE7QUFFOUI7Ozs7R0FJRztBQUNILFNBQWdCLHFCQUFxQixDQUFDLEtBQWdDO0lBQ3BFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE9BQU8sU0FBUyxDQUFBO0lBQ2xCLENBQUM7SUFDRCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUE7SUFFekIsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUN4QyxNQUFNLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUMzQixPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBO0lBQ3hELENBQUM7SUFFRCxNQUFNLEtBQUssR0FBRywwREFBMEQsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7SUFDbkYsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1gsT0FBTyxTQUFTLENBQUE7SUFDbEIsQ0FBQztJQUNELE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQTtJQUMxQyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBRTNELDRFQUE0RTtJQUM1RSxJQUFJLEdBQUcsR0FBRyxZQUFZLEdBQUcsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFBO0lBQy9DLEdBQUcsR0FBRyxZQUFZLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ2xDLE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7QUFDdEIsQ0FBQztBQUVELG9FQUFvRTtBQUNwRSxTQUFTLFFBQVEsQ0FBQyxPQUFlO0lBQy9CLE1BQU0sS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUU7UUFDN0MsUUFBUSxFQUFFLE1BQU07UUFDaEIsU0FBUyxFQUFFLEtBQUs7UUFDaEIsSUFBSSxFQUFFLFNBQVM7UUFDZixLQUFLLEVBQUUsU0FBUztRQUNoQixHQUFHLEVBQUUsU0FBUztRQUNkLElBQUksRUFBRSxTQUFTO1FBQ2YsTUFBTSxFQUFFLFNBQVM7UUFDakIsTUFBTSxFQUFFLFNBQVM7S0FDbEIsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFBO0lBRW5DLE1BQU0sR0FBRyxHQUFHLENBQUMsSUFBWSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQTtJQUNyRixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFBO0lBQzVHLE9BQU8sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQTtBQUNsRCxDQUFDIn0=