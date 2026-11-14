import { Module } from "@medusajs/framework/utils"

import CouponsModuleService from "./service"

export const COUPONS_MODULE = "coupons"

export default Module(COUPONS_MODULE, {
  service: CouponsModuleService,
})

export { CouponsModuleService }
