import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  ...medusa.configs.recommended,
  {
    // The kit's HTTP client and the copy-in storefront component have no
    // Medusa dependency on purpose, so they throw their own error types.
    files: ["src/lib/back-in-stock/kit/**/*.ts", "storefront/**/*.{ts,tsx}"],
    rules: { "@medusajs/use-medusa-error-not-generic-error": "off" },
  },
  {
    // The repo keeps each plugin's middleware routes in its namespace; `src/api/middlewares.ts` spreads them.
    files: ["src/lib/back-in-stock/api/middlewares.ts"],
    rules: { "@medusajs/middlewares-file-location-and-name": "off" },
  },
  { ignores: [".medusa/**", "dist/**", "coverage/**"] },
])
