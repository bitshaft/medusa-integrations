export type CsvCell = string | number | boolean | null | undefined

/**
 * CSV for Excel set to Polish: BOM, `;` separator, CRLF, decimal comma.
 * Cells starting with `=`, `+`, `-` or `@` get an apostrophe so text can
 * never run as a formula; numbers stay numbers.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const cell = (value: CsvCell) => {
    if (value == null) return ""
    let text = typeof value === "number" ? String(value).replace(".", ",") : String(value)
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
    if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
    return text
  }
  return `﻿${[header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`
}
