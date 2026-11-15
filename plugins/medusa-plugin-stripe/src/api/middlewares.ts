import { defineMiddlewares } from "@medusajs/framework/http"

import { stripeMiddlewares } from "../lib/stripe/api/middlewares"

export default defineMiddlewares({
  routes: [...stripeMiddlewares],
})
