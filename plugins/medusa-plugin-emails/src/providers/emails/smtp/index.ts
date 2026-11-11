import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import EmailsSmtpProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [EmailsSmtpProviderService],
})

export { EmailsSmtpProviderService }
export type { SmtpProviderOptions } from "./service"
