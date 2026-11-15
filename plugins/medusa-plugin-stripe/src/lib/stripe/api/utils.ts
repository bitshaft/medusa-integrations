import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { type CsvCell, toCsv } from "../csv"
import { minorUnitDigits } from "../money"
import { pluginDisabledError } from "../kit/options"
import { PLUGIN_NAME } from "../options"
import type { StripeReader } from "../reader"
import { resolveStripe } from "../server/runtime"

export { validateQuery } from "../kit/api"

/** Demo data, or a reader; a clear "disabled" error when there is neither. */
export function source(req: MedusaRequest): { demo: true } | { demo: false; reader: StripeReader } {
  const service = resolveStripe(req.scope)
  if (!service.isEnabled()) throw pluginDisabledError(PLUGIN_NAME, service.disabledReason() ?? "invalid options")
  if (service.isDemo()) return { demo: true }
  const reader = service.reader()
  if (!reader) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Set the apiKey option to read data from Stripe.")
  return { demo: false, reader }
}

/** `255,00` from 25500 grosze: integer arithmetic only, comma for Polish Excel. */
export function decimal(minor: number | null | undefined, currency: string): string {
  if (minor == null) return ""
  const digits = minorUnitDigits(currency)
  const sign = minor < 0 ? "-" : ""
  const abs = Math.abs(minor)
  if (!digits) return `${sign}${abs}`
  const unit = 10 ** digits
  return `${sign}${Math.floor(abs / unit)},${String(abs % unit).padStart(digits, "0")}`
}

/** A CSV download. When the data was cut, the first row says so in both languages. */
export function sendCsv(
  res: MedusaResponse,
  name: string,
  header: string[],
  rows: CsvCell[][],
  incomplete: { partial: boolean; truncated: string[]; missed: string[] }
) {
  const warning = incomplete.partial
    ? [
        [
          incomplete.truncated.length
            ? "UWAGA: dane niepełne, plik zawiera tylko pierwsze 1000 pozycji. / WARNING: incomplete, only the first 1000 items are included."
            : "UWAGA: dane niepełne, Stripe nie odpowiedział w czasie. / WARNING: incomplete, Stripe did not answer in time.",
        ],
      ]
    : []
  const csv = toCsv(header, [...warning, ...rows])
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.setHeader("Cache-Control", "no-store")
  if (incomplete.partial) res.setHeader("X-Stripe-Data-Incomplete", "true")
  res.status(200).send(csv)
}
