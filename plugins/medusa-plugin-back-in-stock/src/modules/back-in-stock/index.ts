import { Module } from "@medusajs/framework/utils"

import BackInStockModuleService from "./service"

/** Medusa allows no dashes in module names, so the namespace is spelled with an underscore here. */
export const BACK_IN_STOCK_MODULE = "back_in_stock"

export default Module(BACK_IN_STOCK_MODULE, {
  service: BackInStockModuleService,
})

export { BackInStockModuleService }
