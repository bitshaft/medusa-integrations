import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { describeError } from "../lib/emails/errors"
import { toNumber } from "../lib/emails/format"
import { diffLowStock, type StockLevel } from "../lib/emails/low-stock"
import { sendEmail } from "../lib/emails/send"
import { EMAILS_MODULE } from "../modules/emails"
import type EmailsModuleService from "../modules/emails/service"

const TYPE = "team-low-stock"
const PAGE = 500
/** Longest list one alert email shows. */
const MAX_LINES = 100

/**
 * Tells the store team about inventory items that dropped to the low stock
 * threshold (Settings → Emails). Each item is reported once; when it is
 * restocked above the threshold, the next shortage is reported again.
 */
export default async function emailsLowStock(container: MedusaContainer) {
  const emails = container.resolve<EmailsModuleService>(EMAILS_MODULE)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!(await emails.isEnabled())) {
    return
  }

  try {
    const settings = await emails.getSettings()
    if (!settings.types[TYPE]?.enabled) {
      return
    }

    const levels = await loadStockLevels(container)
    const alerts = await emails.listEmailsLowStockAlerts(
      {},
      { select: ["id", "inventory_item_id", "location_id"], take: null }
    )
    const { toAlert, toClear } = diffLowStock(levels, alerts, settings.low_stock_threshold)

    if (toClear.length) {
      await emails.deleteEmailsLowStockAlerts(toClear)
    }
    if (!toAlert.length) {
      return
    }

    const result = await sendEmail(container, {
      type: TYPE,
      trigger: "emails-low-stock",
      data: {
        threshold: settings.low_stock_threshold,
        items: toAlert.slice(0, MAX_LINES).map(({ title, sku, location, available }) => ({
          title,
          sku,
          location,
          available,
        })),
      },
    })
    // Nothing was sent or queued (e.g. no recipients yet): report these items on the next run.
    if (result.status === "skipped") {
      return
    }
    await emails.createEmailsLowStockAlerts(
      toAlert.map(({ inventory_item_id, location_id, available }) => ({ inventory_item_id, location_id, available }))
    )
  } catch (error) {
    logger.error(`[emails] The low stock check failed: ${describeError(error)}`)
  }
}

/** Every inventory level with its available quantity (stocked minus reserved). */
async function loadStockLevels(container: MedusaContainer): Promise<StockLevel[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const rows: Array<{
    inventory_item_id: string
    location_id: string
    stocked_quantity?: unknown
    reserved_quantity?: unknown
    inventory_item?: { title?: string | null; sku?: string | null } | null
  }> = []

  for (let skip = 0; ; skip += PAGE) {
    const { data } = await query.graph({
      entity: "inventory_level",
      fields: [
        "inventory_item_id",
        "location_id",
        "stocked_quantity",
        "reserved_quantity",
        "inventory_item.title",
        "inventory_item.sku",
      ],
      pagination: { take: PAGE, skip },
    })
    rows.push(...(data as unknown as typeof rows))
    if (data.length < PAGE) {
      break
    }
  }

  const locationIds = [...new Set(rows.map((row) => row.location_id))]
  const locations = locationIds.length
    ? await container
        .resolve(Modules.STOCK_LOCATION)
        .listStockLocations({ id: locationIds }, { select: ["id", "name"], take: null })
    : []
  const locationNames = new Map(locations.map((location) => [location.id, location.name]))

  return rows.map((row) => ({
    inventory_item_id: row.inventory_item_id,
    location_id: row.location_id,
    available: toNumber(row.stocked_quantity) - toNumber(row.reserved_quantity),
    title: row.inventory_item?.title || row.inventory_item?.sku || row.inventory_item_id,
    sku: row.inventory_item?.sku ?? null,
    location: locationNames.get(row.location_id) ?? null,
  }))
}

export const config = {
  name: "emails-low-stock",
  schedule: "*/30 * * * *",
}
