import { defineMiddlewares } from "@medusajs/framework/http"

import { complianceMiddlewares } from "../lib/compliance/api/middlewares"

export default defineMiddlewares({
  routes: [...complianceMiddlewares],
})
