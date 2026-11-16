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
export function extractTopLevelValue(json: string, key: string): string | undefined {
  return topLevelEntries(json)?.find((entry) => entry.key === key)?.value
}

/**
 * Every top-level property of a JSON object with the exact source text of
 * its value, in order and including repeated keys (which `JSON.parse`
 * silently collapses to the last one). `undefined` when the document is not
 * a JSON object this scanner can read.
 */
export function topLevelEntries(json: string): Array<{ key: string; value: string }> | undefined {
  const entries: Array<{ key: string; value: string }> = []
  let i = skipWhitespace(json, 0)
  if (json[i] !== "{") {
    return undefined
  }
  i++

  while (i < json.length) {
    i = skipWhitespace(json, i)
    if (json[i] === "}") {
      return entries
    }
    if (json[i] === ",") {
      i = skipWhitespace(json, i + 1)
    }
    if (json[i] !== '"') {
      return undefined
    }

    const keyEnd = scanString(json, i)
    const key = JSON.parse(json.slice(i, keyEnd)) as string
    i = skipWhitespace(json, keyEnd)
    if (json[i] !== ":") {
      return undefined
    }
    i = skipWhitespace(json, i + 1)

    const valueEnd = scanValue(json, i)
    entries.push({ key, value: json.slice(i, valueEnd) })
    i = valueEnd
  }

  return undefined
}

function skipWhitespace(json: string, i: number): number {
  while (i < json.length && " \t\n\r".includes(json[i])) {
    i++
  }
  return i
}

/** `i` points at the opening quote; returns the index after the closing quote. */
function scanString(json: string, i: number): number {
  i++
  while (i < json.length) {
    const ch = json[i]
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === '"') {
      return i + 1
    }
    i++
  }
  throw new SyntaxError("Unterminated string in JSON")
}

/** Returns the index right after the value starting at `i`. */
function scanValue(json: string, i: number): number {
  const ch = json[i]
  if (ch === '"') {
    return scanString(json, i)
  }
  if (ch === "{" || ch === "[") {
    let depth = 0
    while (i < json.length) {
      const c = json[i]
      if (c === '"') {
        i = scanString(json, i)
        continue
      }
      if (c === "{" || c === "[") {
        depth++
      } else if (c === "}" || c === "]") {
        depth--
        if (depth === 0) {
          return i + 1
        }
      }
      i++
    }
    throw new SyntaxError("Unterminated object or array in JSON")
  }
  // number, true, false, null
  while (i < json.length && !",}] \t\n\r".includes(json[i])) {
    i++
  }
  return i
}
