import { defineMiddlewares } from "@medusajs/framework/http"

import { olxMiddlewares } from "../lib/olx/api/middlewares"

export default defineMiddlewares({
  routes: [...olxMiddlewares],
})
