import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import EmailsResendProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [EmailsResendProviderService],
})

export { EmailsResendProviderService }
export type { ResendProviderOptions } from "./service"
