import { defineConfig, loadEnv } from "@medusajs/framework/utils"

/**
 * Test app for integration-tests/http only: a whole Medusa app with this
 * plugin's src/ loaded as the project's code. Not part of the package
 * (excluded from the build and from "files").
 */
loadEnv(process.env.NODE_ENV || "test", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: "*",
      adminCors: "*",
      authCors: "*",
      jwtSecret: process.env.JWT_SECRET || "negotiations-test",
      cookieSecret: process.env.COOKIE_SECRET || "negotiations-test",
    },
  },
  admin: { disable: true },
  modules: [
    {
      resolve: "./src/modules/negotiations",
      options: {
        expiryDays: 14,
        defaultCurrency: "pln",
        allowedCustomerGroups: ["b2b"],
        writers: { draftOrders: true, cart: true },
        limits: { messagesPerHour: 10, maxQuantity: 500 },
      },
    },
  ],
})
