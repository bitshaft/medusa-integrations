import { readFileSync } from "node:fs"
import { join } from "node:path"

export const PACKAGE_NAME = "@bitshaft/medusa-plugin-apaczka"

let cached: string | undefined

/** The installed package version, read once from package.json. */
export function packageVersion(): string {
  if (cached) {
    return cached
  }
  // Source: src/lib → ../../ ; build: .medusa/server/src/lib → ../../../../
  for (const relative of ["../../package.json", "../../../../package.json"]) {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, relative), "utf8"))
      if (pkg.name === PACKAGE_NAME) {
        cached = String(pkg.version)
        return cached
      }
    } catch {
      // try the next location
    }
  }
  cached = "0.0.0"
  return cached
}

/** `User-Agent` sent to Apaczka, as their best practices ask. */
export function userAgent(): string {
  return `medusa-plugin-apaczka/${packageVersion()} (+https://bitshaft.pl) Node/${process.versions.node}`
}
