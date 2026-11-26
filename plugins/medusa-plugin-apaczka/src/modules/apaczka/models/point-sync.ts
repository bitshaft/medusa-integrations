import { model } from "@medusajs/framework/utils"

/**
 * The state of one carrier's stored point list: when it was last synced,
 * from which source, and whether a sync is running (it doubles as the lock
 * that keeps two processes from syncing the same list).
 */
export const ApaczkaPointSync = model
  .define("apaczka_point_sync", {
    id: model.id({ prefix: "apzpts" }).primaryKey(),
    type: model.text(),
    country_code: model.text(),
    /** Where the stored list came from: `demo`, `production`, `sandbox`… */
    source: model.text().nullable(),
    status: model.enum(["idle", "running", "failed"]).default("idle"),
    started_at: model.dateTime().nullable(),
    finished_at: model.dateTime().nullable(),
    succeeded_at: model.dateTime().nullable(),
    point_count: model.number().nullable(),
    error: model.text().nullable(),
  })
  .indexes([{ name: "IDX_apaczka_point_sync_list", on: ["type", "country_code"], unique: true }])
