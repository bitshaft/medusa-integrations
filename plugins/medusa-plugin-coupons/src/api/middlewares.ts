import { defineMiddlewares } from "@medusajs/framework/http"

import { couponsMiddlewares } from "../lib/coupons/api/middlewares"

export default defineMiddlewares({
  routes: [...couponsMiddlewares],
})
