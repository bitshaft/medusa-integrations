import { defineMiddlewares } from "@medusajs/framework/http"

import { backInStockMiddlewares } from "../lib/back-in-stock/api/middlewares"

export default defineMiddlewares({
  routes: [...backInStockMiddlewares],
})
