import { Module } from "@medusajs/framework/utils"

import EmailsModuleService from "./service"

export const EMAILS_MODULE = "emails"

export default Module(EMAILS_MODULE, {
  service: EmailsModuleService,
})

export { EmailsModuleService }
export type { MessageRecord } from "./service"
