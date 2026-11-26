import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ApaczkaApiError, listServices } from "../../../../lib/apaczka/client"
import { WEBHOOK_PATH } from "../../../../lib/apaczka/order-builder"
import { maskIdentifier } from "../../../../lib/apaczka/kit/secrets"
import { packageVersion } from "../../../../lib/apaczka/version"
import { resolveApaczka } from "../../../../lib/apaczka/api/utils"

/**
 * `GET /admin/apaczka/status` — connection check for the settings page:
 * environment, whether the credentials work, how many services the account
 * has and how tracking is set up. Never returns secrets. When the plugin is
 * disabled (missing or invalid options) it returns only the reason.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const apaczka = resolveApaczka(req)

  if (!(await apaczka.isEnabled())) {
    return res.json({ enabled: false, disabled_reason: await apaczka.getDisabledReason(), version: packageVersion() })
  }

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
    enabled: true,
    version: packageVersion(),
    environment: client.demo ? "demo" : client.environment,
    demo: client.demo,
    /** Demo mode whose parcel points come from the account (`livePoints`). */
    live_points: client.livePoints,
    base_url: client.baseUrl,
    app_id: maskIdentifier(options.appId),
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
