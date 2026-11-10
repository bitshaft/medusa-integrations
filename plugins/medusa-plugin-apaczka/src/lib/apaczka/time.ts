const WARSAW = "Europe/Warsaw"

/**
 * Parses `YYYY-MM-DDTHH:mm:ss` (or with a space) as Europe/Warsaw local
 * time — the format Apaczka uses in webhooks. Strings that already carry an
 * offset or `Z` are parsed as-is. Returns `undefined` for invalid input.
 */
export function parseApaczkaTimestamp(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined
  }
  const text = value.trim()

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    const date = new Date(text)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text)
  if (!match) {
    return undefined
  }
  const [, y, mo, d, h, mi, s = "0"] = match
  const wallClockUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)

  // Shift by Warsaw's offset at that moment; a second pass settles DST edges.
  let utc = wallClockUtc - offsetMs(wallClockUtc)
  utc = wallClockUtc - offsetMs(utc)
  return new Date(utc)
}

/** Offset of Europe/Warsaw from UTC at the given instant, in ms. */
function offsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WARSAW,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant))

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - Math.floor(instant / 1000) * 1000
}
