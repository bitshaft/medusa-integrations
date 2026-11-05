import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  ...medusa.configs.recommended,
  {
    // The Apaczka client and the storefront kit have no Medusa dependency
    // on purpose, so they throw their own error types.
    files: ["src/lib/apaczka/**/*.ts", "storefront/**/*.{ts,tsx}"],
    rules: { "@medusajs/use-medusa-error-not-generic-error": "off" },
  },
  { ignores: [".medusa/**", "dist/**", "coverage/**"] },
])
