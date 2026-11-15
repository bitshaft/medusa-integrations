import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  ...medusa.configs.recommended,
  {
    // The kit's HTTP client has no Medusa dependency on purpose, so it throws its own error types.
    files: ["src/lib/negotiations/kit/**/*.ts"],
    rules: { "@medusajs/use-medusa-error-not-generic-error": "off" },
  },
  {
    // The repo keeps each plugin's middleware routes in its namespace; `src/api/middlewares.ts` spreads them.
    files: ["src/lib/negotiations/api/middlewares.ts"],
    rules: { "@medusajs/middlewares-file-location-and-name": "off" },
  },
  {
    // Amounts are integers in minor units (grosze) on purpose; they become decimals only at Medusa's border (money.ts).
    files: ["src/lib/negotiations/**/*.ts", "integration-tests/**/*.ts"],
    rules: { "@medusajs/prices-in-major-units": "off" },
  },
  { ignores: [".medusa/**", "dist/**", "coverage/**"] },
])
