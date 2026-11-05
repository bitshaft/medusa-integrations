"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTopLevelValue = extractTopLevelValue;
/**
 * Finds the exact source text of a top-level property value in a JSON
 * document, without re-serializing it.
 *
 * Apaczka signs webhook payloads over the PHP `json_encode` output of the
 * `response` object. Re-encoding that object in JavaScript usually yields the
 * same bytes, but not always (float formatting such as `1.0` vs `1`, for
 * example). Verifying against the original bytes avoids those mismatches.
 *
 * Returns `undefined` when the document is not an object or has no such key.
 */
function extractTopLevelValue(json, key) {
    let i = skipWhitespace(json, 0);
    if (json[i] !== "{") {
        return undefined;
    }
    i++;
    while (i < json.length) {
        i = skipWhitespace(json, i);
        if (json[i] === "}") {
            return undefined;
        }
        if (json[i] === ",") {
            i = skipWhitespace(json, i + 1);
        }
        if (json[i] !== '"') {
            return undefined;
        }
        const keyEnd = scanString(json, i);
        const currentKey = JSON.parse(json.slice(i, keyEnd));
        i = skipWhitespace(json, keyEnd);
        if (json[i] !== ":") {
            return undefined;
        }
        i = skipWhitespace(json, i + 1);
        const valueEnd = scanValue(json, i);
        if (currentKey === key) {
            return json.slice(i, valueEnd);
        }
        i = valueEnd;
    }
    return undefined;
}
function skipWhitespace(json, i) {
    while (i < json.length && " \t\n\r".includes(json[i])) {
        i++;
    }
    return i;
}
/** `i` points at the opening quote; returns the index after the closing quote. */
function scanString(json, i) {
    i++;
    while (i < json.length) {
        const ch = json[i];
        if (ch === "\\") {
            i += 2;
            continue;
        }
        if (ch === '"') {
            return i + 1;
        }
        i++;
    }
    throw new SyntaxError("Unterminated string in JSON");
}
/** Returns the index right after the value starting at `i`. */
function scanValue(json, i) {
    const ch = json[i];
    if (ch === '"') {
        return scanString(json, i);
    }
    if (ch === "{" || ch === "[") {
        let depth = 0;
        while (i < json.length) {
            const c = json[i];
            if (c === '"') {
                i = scanString(json, i);
                continue;
            }
            if (c === "{" || c === "[") {
                depth++;
            }
            else if (c === "}" || c === "]") {
                depth--;
                if (depth === 0) {
                    return i + 1;
                }
            }
            i++;
        }
        throw new SyntaxError("Unterminated object or array in JSON");
    }
    // number, true, false, null
    while (i < json.length && !",}] \t\n\r".includes(json[i])) {
        i++;
    }
    return i;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbi1zcGFuLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL2xpYi9hcGFjemthL2pzb24tc3Bhbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVdBLG9EQW1DQztBQTlDRDs7Ozs7Ozs7OztHQVVHO0FBQ0gsU0FBZ0Isb0JBQW9CLENBQUMsSUFBWSxFQUFFLEdBQVc7SUFDNUQsSUFBSSxDQUFDLEdBQUcsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUMvQixJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNwQixPQUFPLFNBQVMsQ0FBQTtJQUNsQixDQUFDO0lBQ0QsQ0FBQyxFQUFFLENBQUE7SUFFSCxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdkIsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUE7UUFDM0IsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDcEIsT0FBTyxTQUFTLENBQUE7UUFDbEIsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ3BCLENBQUMsR0FBRyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtRQUNqQyxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDcEIsT0FBTyxTQUFTLENBQUE7UUFDbEIsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUE7UUFDbEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBVyxDQUFBO1FBQzlELENB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