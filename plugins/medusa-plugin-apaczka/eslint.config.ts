import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  ...medusa.configs.recommended,
  {
    // The Apaczka client, the kit's HTTP client and the storefront kit have no
    // Medusa dependency on purpose, so they throw their own error types.
    files: ["src/lib/apaczka/client/**/*.ts", "src/lib/apaczka/kit/**/*.ts", "storefront/**/*.{ts,tsx}"],
    rules: { "@medusajs/use-medusa-error-not-generic-error": "off" },
  },
  { ignores: [".medusa/**", "dist/**", "coverage/**"] },
])
