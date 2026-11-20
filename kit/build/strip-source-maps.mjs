// Removes source maps from the build output so the published package ships
// only compiled code. `medusa plugin:build` always emits them (inline, or as
// .map files when tsconfig has sourceMap: true).
//
//   node scripts/kit/strip-source-maps.mjs [dir]   (default: .medusa/server)
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(process.argv[2] ?? ".medusa/server")
if (!existsSync(root)) {
  console.error(`strip-source-maps: ${root} does not exist; run the build first`)
  process.exit(1)
}

const MAP_COMMENT = /\n?\/\/[#@] sourceMappingURL=[^\n]*\s*$/
let stripped = 0
let removed = 0

const visit = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      visit(full)
    } else if (name.endsWith(".map")) {
      rmSync(full)
      removed++
    } else if (/\.(c|m)?js$/.test(name)) {
      const source = readFileSync(full, "utf8")
      const next = source.replace(MAP_COMMENT, "\n")
      if (next !== source) {
        writeFileSync(full, next)
        stripped++
      }
    }
  }
}

visit(root)
console.log(`strip-source-maps: ${stripped} inline maps stripped, ${removed} .map files removed`)
