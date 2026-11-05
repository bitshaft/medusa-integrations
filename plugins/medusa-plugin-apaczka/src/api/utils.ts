import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"

import { APACZKA_MODULE } from "../modules/apaczka"
import type ApaczkaModuleService from "../modules/apaczka/service"

export function resolveApaczka(req: MedusaRequest): ApaczkaModuleService {
  return req.scope.resolve<ApaczkaModuleService>(APACZKA_MODULE)
}

/** Validates `req.query` and stores the parsed result on `req.validatedQuery`. */
export function validateQuery(schema: z.ZodType) {
  return (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
        .join("; ")
      return next(new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid request: ${message}`))
    }
    req.validatedQuery = result.data as Record<string, unknown>
    next()
  }
}

/** Sends a base64 document from Apaczka as a file download. */
export function sendDocument(
  res: MedusaResponse,
  input: { base64: string; contentType: string; fileName: string; inline?: boolean }
) {
  const buffer = Buffer.from(input.base64, "base64")
  res.setHeader("Content-Type", input.contentType)
  res.setHeader("Content-Length", buffer.length)
  res.setHeader(
    "Content-Disposition",
    `${input.inline ? "inline" : "attachment"}; filename="${input.fileName.replace(/"/g, "")}"`
  )
  res.setHeader("Cache-Control", "private, max-age=300")
  res.status(200).send(buffer)
}
