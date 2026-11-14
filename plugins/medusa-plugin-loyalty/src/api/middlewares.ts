import { defineMiddlewares } from "@medusajs/framework/http"

import { loyaltyMiddlewares } from "../lib/loyalty/api/middlewares"

export default defineMiddlewares({
  routes: [...loyaltyMiddlewares],
})
