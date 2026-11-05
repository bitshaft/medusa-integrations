import { Module } from "@medusajs/framework/utils"

import ApaczkaModuleService from "./service"

export const APACZKA_MODULE = "apaczka"

export default Module(APACZKA_MODULE, {
  service: ApaczkaModuleService,
})

export { ApaczkaModuleService }
export type { TrackingEventInput } from "./service"
