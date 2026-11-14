import type { MedusaResponse } from "@medusajs/framework/http"

import { type CustomerExport, exportZip } from "../server/export"

/** Sends a data export as a JSON download or a ZIP with data.json and CSV files. */
export function sendExport(res: MedusaResponse, data: CustomerExport, format: "zip" | "json", name: string) {
  const date = new Date().toISOString().slice(0, 10)
  const safe = name.replace(/[^\w-]+/g, "_")
  res.setHeader("Cache-Control", "no-store")
  if (format === "json") {
    res.setHeader("Content-Disposition", `attachment; filename="data-${safe}-${date}.json"`)
    res.json(data)
    return
  }
  const buffer = exportZip(data)
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Length", buffer.length)
  res.setHeader("Content-Disposition", `attachment; filename="data-${safe}-${date}.zip"`)
  res.status(200).send(buffer)
}
