import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import ApaczkaFulfillmentProviderService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [ApaczkaFulfillmentProviderService],
})

export { ApaczkaFulfillmentProviderService }
export type { ApaczkaAdditionalData } from "./service"
