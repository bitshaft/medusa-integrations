import { Module } from "@medusajs/framework/utils"

import WhitelistVatModuleService from "./service"

/** Medusa allows no dashes in module names, so the namespace is spelled with an underscore here. */
export const WHITELIST_VAT_MODULE = "whitelist_vat"

export default Module(WHITELIST_VAT_MODULE, {
  service: WhitelistVatModuleService,
})

export { WhitelistVatModuleService }
