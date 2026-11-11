import { defineMiddlewares } from "@medusajs/framework/http"

import { emailsMiddlewares } from "../lib/emails/api/middlewares"

export default defineMiddlewares({
  routes: [...emailsMiddlewares],
})
