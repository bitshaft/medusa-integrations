import type { MedusaRequest } from "@medusajs/framework/http"

import { APACZKA_MODULE } from "../../../modules/apaczka"
import type ApaczkaModuleService from "../../../modules/apaczka/service"

export { sendBase64Document as sendDocument, validateQuery } from "../kit/api"

export function resolveApaczka(req: MedusaRequest): ApaczkaModuleService {
  return req.scope.resolve<ApaczkaModuleService>(APACZKA_MODULE)
}
