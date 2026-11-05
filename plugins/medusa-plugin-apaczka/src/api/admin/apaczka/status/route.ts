import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ApaczkaApiError, listServices } from "../../../../lib/apaczka"
import { WEBHOOK_PATH } from "../../../../lib/order-builder"
import { packageVersion } from "../../../../lib/version"
import { resolveApaczka } from "../../../utils"

/**
 * `GET /admin/apaczka/status` — connection check for the settings page:
 * environment, whether the credentials work, how many services the account
 * has and how tracking is set up. Never returns secrets.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const apaczka = resolveApaczka(req)
  const options = await apaczka.getOptions()
  const client = await apaczka.getClient()

  let connection: { ok: boolean; services?: number; error?: string; authentication_error?: boolean }
  try {
    const structure = await (await apaczka.getCatalog()).getServiceStructure({ refresh: req.query.refresh === "true" })
    connection = { ok: true, services: listServices(structure).length }
  } catch (error) {
    connection = {
      ok: false,
      error: (error as Error).message,
      authentication_error: error instanceof ApaczkaApiError && error.isAuthenticationError,
    }
  }

  res.json({
    version: packageVersion(),
    environment: client.environment,
    base_url: client.baseUrl,
    app_id: mask(options.appId),
    connection,
    settings: {
      shipment_creation: options.shipmentCreation,
      label_format: options.labelFormat,
      pickup_type: options.pickup.type,
      pricing_basis: options.pricing.basis,
      insurance: options.insurance.mode,
      cod_account_configured: Boolean(options.cod.bankAccount || options.cod.bankAccountId),
      sender_defaults: Object.keys(options.sender).filter((key) => options.sender[key as keyof typeof options.sender]),
      sender_locations: Object.keys(options.senderByLocation),
    },
    tracking: {
      webhook_url: options.webhooks.backendUrl ? options.webhooks.backendUrl.replace(/\/+$/, "") + WEBHOOK_PATH : null,
      polling: options.tracking.polling,
      mark_shipped: options.tracking.markShipped,
      mark_delivered: options.tracking.markDelivered,
    },
  })
}

function mask(value: string): string {
  return value.length <= 8 ? "••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`
}
