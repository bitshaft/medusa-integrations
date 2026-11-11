import { defineMiddlewares } from "@medusajs/framework/http"

import { whitelistVatMiddlewares } from "../lib/whitelist-vat/api/middlewares"

export default defineMiddlewares({
  routes: [...whitelistVatMiddlewares],
})
