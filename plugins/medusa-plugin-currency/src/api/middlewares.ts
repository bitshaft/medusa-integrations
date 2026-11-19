import { defineMiddlewares } from "@medusajs/framework/http"

import { currencyMiddlewares } from "../lib/currency/api/middlewares"

export default defineMiddlewares({
  routes: [...currencyMiddlewares],
})
