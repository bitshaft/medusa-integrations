import { Module } from "@medusajs/framework/utils"

import NegotiationsModuleService from "./service"

export const NEGOTIATIONS_MODULE = "negotiations"

export default Module(NEGOTIATIONS_MODULE, {
  service: NegotiationsModuleService,
})

export { NegotiationsModuleService }
