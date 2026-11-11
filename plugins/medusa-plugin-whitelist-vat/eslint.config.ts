import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  ...medusa.configs.recommended,
  {
    // The register clients and the kit's HTTP client have no Medusa
    // dependency on purpose, so they throw their own error types.
    files: ["src/lib/whitelist-vat/registers/**/*.ts", "src/lib/whitelist-vat/kit/**/*.ts"],
    rules: { "@medusajs/use-medusa-error-not-generic-error": "off" },
  },
  {
    // The repo keeps each plugin's middleware routes in its namespace; `src/api/middlewares.ts` spreads them.
    files: ["src/lib/whitelist-vat/api/middlewares.ts"],
    rules: { "@medusajs/middlewares-file-location-and-name": "off" },
  },
  { ignores: [".medusa/**", "dist/**", "coverage/**"] },
])
