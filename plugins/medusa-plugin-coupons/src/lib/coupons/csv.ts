export type CsvCell = string | number | boolean | null | undefined

/**
 * CSV that opens correctly in Excel set to Polish: a BOM so UTF-8 letters
 * survive, `;` as separator (Polish Excel uses `,` for decimals), CRLF line
 * ends. Cells starting with `=`, `+`, `-` or `@` get a leading apostrophe so
 * a code or e-mail can never run as a spreadsheet formula.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(";"))
  return `﻿${lines.join("\r\n")}\r\n`
}

function cell(value: CsvCell): string {
  if (value == null) return ""
  let text = typeof value === "number" ? String(value).replace(".", ",") : String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

/** A file name safe for Content-Disposition: `kupony-2026-11-14.csv`. */
export function csvFileName(prefix: string, now: Date): string {
  const safe = prefix.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-")
  return `${safe}-${now.toISOString().slice(0, 10)}.csv`
}
