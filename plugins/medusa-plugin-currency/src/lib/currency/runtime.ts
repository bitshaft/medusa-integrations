import type { MedusaContainer } from "@medusajs/framework/types"

import { CURRENCY_MODULE } from "../../modules/currency"
import type CurrencyModuleService from "../../modules/currency/service"

export function resolveCurrency(container: MedusaContainer): CurrencyModuleService {
  return container.resolve<CurrencyModuleService>(CURRENCY_MODULE)
}
