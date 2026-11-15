import { defineMiddlewares } from "@medusajs/framework/http"

import { negotiationsMiddlewares } from "../lib/negotiations/api/middlewares"

export default defineMiddlewares({
  routes: [...negotiationsMiddlewares],
})
