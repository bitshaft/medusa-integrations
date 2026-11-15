import { Module } from "@medusajs/framework/utils"

import StripeModuleService from "./service"

export const STRIPE_MODULE = "stripe"

export default Module(STRIPE_MODULE, {
  service: StripeModuleService,
})

export { StripeModuleService }
