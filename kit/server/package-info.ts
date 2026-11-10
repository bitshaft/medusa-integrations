import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

const cache = new Map<string, string>()

/**
 * Version of the named package, found by walking up from `fromDir` (pass
 * `__dirname`). Works from the source tree, the build output and an app
 * that vendored the code. Returns `0.0.0` when nothing matches.
 */
export function readPackageVersion(packageName: string, fromDir: string): string {
  const key = `${packageName}@${fromDir}`
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  let version = "0.0.0"
  let dir = fromDir
  for (let depth = 0; depth < 8; depth++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
      if (pkg.name === packageName) {
        version = String(pkg.version)
        break
      }
    } catch {
      // no package.json here; keep walking
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }

  cache.set(key, version)
  return version
}

/** `name/version (+url) Node/x.y.z`, the User-Agent format integrations send. */
export function buildUserAgent(name: string, version: string, url?: string): string {
  return `${name}/${version}${url ? ` (+${url})` : ""} Node/${process.versions.node}`
}
