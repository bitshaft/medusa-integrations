import { Module } from "@medusajs/framework/utils"

import OlxModuleService from "./service"

export const OLX_MODULE = "olx"

export default Module(OLX_MODULE, {
  service: OlxModuleService,
})

export { OlxModuleService }
