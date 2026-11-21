import { defineConfig, loadEnv } from "@medusajs/framework/utils"

/**
 * Test app for integration-tests/http only: a whole Medusa app with this
 * plugin's src/ loaded as the project's code, in demo mode (no OLX calls).
 * Not part of the package (excluded from the build and from "files").
 */
loadEnv(process.env.NODE_ENV || "test", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: "*",
      adminCors: "*",
      authCors: "*",
      jwtSecret: process.env.JWT_SECRET || "olx-test",
      cookieSecret: process.env.COOKIE_SECRET || "olx-test",
    },
  },
  admin: { disable: true },
  modules: [{ resolve: "./src/modules/olx", options: { demo: true } }],
})
