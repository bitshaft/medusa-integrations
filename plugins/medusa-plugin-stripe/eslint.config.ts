import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  ...medusa.configs.recommended,
  {
    // The kit's HTTP client has no Medusa dependency on purpose, so it throws its own error types.
    files: ["src/lib/stripe/kit/**/*.ts"],
    rules: { "@medusajs/use-medusa-error-not-generic-error": "off" },
  },
  {
    // The repo keeps each plugin's middleware routes in its namespace; `src/api/middlewares.ts` spreads them.
    files: ["src/lib/stripe/api/middlewares.ts"],
    rules: { "@medusajs/middlewares-file-location-and-name": "off" },
  },
  {
    // Stripe sends amounts as integers in the smallest currency unit and the
    // plugin keeps them that way on purpose; they are not Medusa prices.
    files: ["src/lib/stripe/**/*.ts", "src/api/admin/stripe/**/*.ts"],
    rules: { "@medusajs/prices-in-major-units": "off" },
  },
  { ignores: [".medusa/**", "dist/**", "coverage/**"] },
])
