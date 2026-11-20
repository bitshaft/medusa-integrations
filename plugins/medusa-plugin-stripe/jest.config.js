const { loadEnv } = require("@medusajs/framework/utils")

loadEnv("test", process.cwd())

const transform = {
  "^.+\\.[jt]sx?$": [
    "@swc/jest",
    {
      jsc: {
        parser: { syntax: "typescript", tsx: true, decorators: true },
        target: "es2022",
        transform: { react: { runtime: "automatic" } },
      },
    },
  ],
}

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      transform,
      moduleFileExtensions: ["js", "ts", "tsx", "json"],
      testMatch: ["<rootDir>/src/**/__tests__/**/*.spec.{ts,tsx}"],
      modulePathIgnorePatterns: ["<rootDir>/.medusa/", "<rootDir>/dist/"],
    },
  ],
  collectCoverageFrom: ["src/lib/**/*.ts", "src/providers/**/*.ts", "!src/**/__tests__/**"],
  coverageThreshold: {
    "./src/lib/": { branches: 75, functions: 85, lines: 85, statements: 85 },
  },
}
