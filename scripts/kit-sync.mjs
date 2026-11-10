#!/usr/bin/env node
// Copies kit/ into every plugin so each package is self-contained.
//
//   node scripts/kit-sync.mjs           write the copies
//   node scripts/kit-sync.mjs --check   exit 1 if any copy is missing or out of date
//
// kit/server -> plugins/<plugin>/src/lib/<namespace>/kit
// kit/admin  -> plugins/<plugin>/src/admin/lib/<namespace>/kit   (only for plugins with src/admin)
// kit/build  -> plugins/<plugin>/scripts/kit                      (build helpers, not published)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { GENERATED_MARKER, headerFor, listPlugins, ROOT, toLf, walk } from "./lib.mjs"

const check = process.argv.includes("--check")

const TARGETS = [
  { source: "kit/server", target: (ns) => `src/lib/${ns}/kit`, when: () => true },
  { source: "kit/admin", target: (ns) => `src/admin/lib/${ns}/kit`, when: (dir) => existsSync(join(dir, "src/admin")) },
  // Build helpers run from the plugin's package.json scripts; never published.
  { source: "kit/build", target: () => "scripts/kit", when: () => true },
]

/** Expected file contents for one plugin: Map<relative path in plugin, content>. */
function expectedKitFiles(plugin) {
  const files = new Map()
  for (const { source, target, when } of TARGETS) {
    if (!when(plugin.dir)) {
      continue
    }
    for (const file of walk(join(ROOT, source))) {
      if (file === "README.md") {
        continue
      }
      const header = headerFor(file, `copied from ${source}/${file} by scripts/kit-sync.mjs. Do not edit by hand.`)
      if (!header) {
        throw new Error(`kit file ${source}/${file} has a format that cannot carry the generated header`)
      }
      const body = toLf(readFileSync(join(ROOT, source, file), "utf8"))
      files.set(`${target(plugin.namespace)}/${file}`, header + body)
    }
  }
  return files
}

/** Kit directories in a plugin, whether or not they currently exist. */
function kitDirs(plugin) {
  return TARGETS.filter(({ when }) => when(plugin.dir)).map(({ target }) => target(plugin.namespace))
}

const problems = []
let written = 0
let removed = 0

for (const plugin of listPlugins()) {
  const expected = expectedKitFiles(plugin)

  for (const [file, content] of expected) {
    const full = join(plugin.dir, file)
    const current = existsSync(full) ? toLf(readFileSync(full, "utf8")) : null
    if (current === content) {
      continue
    }
    if (check) {
      problems.push(`${plugin.folder}/${file} is ${current === null ? "missing" : "out of date"}`)
      continue
    }
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
    written++
  }

  // Stale copies: files in a kit directory that kit/ no longer has.
  for (const dir of kitDirs(plugin)) {
    for (const file of walk(join(plugin.dir, dir))) {
      const rel = `${dir}/${file}`
      if (expected.has(rel)) {
        continue
      }
      const full = join(plugin.dir, rel)
      const isGenerated = readFileSync(full, "utf8").includes(GENERATED_MARKER)
      if (check || !isGenerated) {
        problems.push(
          `${plugin.folder}/${rel} ${isGenerated ? "is a stale kit copy" : "is not generated; kit folders may only hold kit copies"}`
        )
        continue
      }
      rmSync(full)
      removed++
    }
  }
}

if (problems.length) {
  console.error(problems.map((line) => `  - ${line}`).join("\n"))
  console.error(check ? "Kit copies are out of sync. Run: npm run kit:sync" : "kit-sync stopped on the files above.")
  process.exit(1)
}

console.log(check ? "Kit copies are up to date." : `Kit synced: ${written} written, ${removed} removed.`)
