import { MedusaError } from "@medusajs/framework/utils"

import { OlxReconnectError } from "../auth"
import { OlxRefusedError } from "../client"
import type { WriteResult } from "../engine"
import type { AdvertRecord } from "../types"

/** An advert as the admin sees it: without internal claim fields. */
export function advertView(row: AdvertRecord) {
  return {
    id: row.id,
    variant_id: row.variant_id,
    product_id: row.product_id,
    olx_advert_id: row.olx_advert_id,
    status: row.status,
    url: row.url,
    valid_to: row.valid_to,
    title: row.title,
    price: row.price,
    payload: row.payload,
    last_error: row.last_error,
    pending_deactivate: row.pending_deactivate,
    sold_channel: row.sold_channel,
    sold_at: row.sold_at,
    synced_at: row.synced_at,
    created_at: row.created_at ?? null,
  }
}

/** A write's outcome for the admin. */
export const writeView = (result: WriteResult) =>
  "advert" in result ? { ...result, advert: advertView(result.advert) } : result

/** A failed read from OLX as a clear error for the admin. */
export function olxReadError(error: unknown): MedusaError {
  if (error instanceof OlxReconnectError) {
    return new MedusaError(MedusaError.Types.NOT_ALLOWED, error.message)
  }
  if (error instanceof OlxRefusedError) {
    return new MedusaError(MedusaError.Types.INVALID_DATA, error.message)
  }
  if (error instanceof MedusaError) {
    return error
  }
  return new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    `OLX did not answer: ${(error as Error).message}. Try again in a moment.`
  )
}

/** Removes Polish letters and case, so "Lodz" finds "Łódź". */
export const fold = (text: string): string => text.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
