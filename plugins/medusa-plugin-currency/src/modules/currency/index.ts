import { Module } from "@medusajs/framework/utils"

import CurrencyModuleService from "./service"

/**
 * Medusa's own Currency module is registered as "currency", so this
 * plugin's module needs another name. Its tables still start with
 * `currency_` (Medusa's has only the table `currency`).
 */
export const CURRENCY_MODULE = "bitshaft_currency"

export default Module(CURRENCY_MODULE, {
  service: CurrencyModuleService,
})

export { CurrencyModuleService }
