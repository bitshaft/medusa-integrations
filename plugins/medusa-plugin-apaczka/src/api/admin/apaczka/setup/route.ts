import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { resolveApaczka } from "../../../../lib/apaczka/api/utils"
import { setupStep } from "../../../../lib/apaczka/kit/setup"

/** What the sender address needs before Apaczka accepts an order. */
const SENDER_FIELDS = ["name", "line1", "postalCode", "city", "phone", "email"] as const

type Countable = {
  listShippingOptions: (
    filters: Record<string, unknown>,
    config: Record<string, unknown>
  ) => Promise<{ provider_id?: string | null }[]>
  listAndCountProductVariants: (
    filters: Record<string, unknown>,
    config: Record<string, unknown>
  ) => Promise<[unknown[], number]>
}

/**
 * `GET /admin/apaczka/setup`: the installation steps for the Guide tab,
 * with their status detected from this store. Texts live in the admin
 * translations. Uses the cached service list, so it costs no API call
 * while the cache is fresh.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const apaczka = resolveApaczka(req)
  if (!(await apaczka.isEnabled())) {
    return res.json({ steps: [setupStep("install", false), setupStep("credentials", false)] })
  }
  const options = await apaczka.getOptions()
  const client = await apaczka.getClient()

  let connected = false
  try {
    await (await apaczka.getCatalog()).getServiceStructure()
    connected = true
  } catch {
    connected = false
  }

  const senders = [options.sender, ...Object.values(options.senderByLocation)]
  const senderComplete = senders.some((s) => SENDER_FIELDS.every((field) => Boolean(s[field])))

  const fulfillment = req.scope.resolve(Modules.FULFILLMENT) as unknown as Countable
  const product = req.scope.resolve(Modules.PRODUCT) as unknown as Countable
  const [shippingOptions, [, withoutWeight], [shipment]] = await Promise.all([
    fulfillment.listShippingOptions({}, { select: ["id", "provider_id"] }),
    product.listAndCountProductVariants({ weight: null }, { take: 1, select: ["id"] }),
    apaczka.listApaczkaShipments({}, { take: 1, select: ["id"] }),
  ])
  const apaczkaOptions = shippingOptions.filter((o) => o.provider_id?.startsWith("apaczka_")).length

  res.json({
    steps: [
      setupStep("install", true),
      setupStep("credentials", connected, { params: { environment: client.demo ? "demo" : client.environment } }),
      setupStep("sender", senderComplete),
      setupStep("shippingOptions", apaczkaOptions > 0, { params: { count: apaczkaOptions } }),
      setupStep("weights", withoutWeight === 0, { optional: true, params: { count: withoutWeight } }),
      setupStep("webhook", Boolean(options.webhooks.backendUrl), { optional: true }),
      setupStep("cod", Boolean(options.cod.bankAccount || options.cod.bankAccountId), { optional: true }),
      setupStep("firstShipment", Boolean(shipment)),
      setupStep("production", !client.demo && client.environment === "production"),
    ],
  })
}
