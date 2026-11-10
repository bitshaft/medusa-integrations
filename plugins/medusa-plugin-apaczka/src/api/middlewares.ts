import { defineMiddlewares } from "@medusajs/framework/http"

import { apaczkaMiddlewares } from "../lib/apaczka/api/middlewares"

export default defineMiddlewares({
  routes: [...apaczkaMiddlewares],
})
