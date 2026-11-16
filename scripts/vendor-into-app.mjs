#!/usr/bin/env node
// Copies each plugin's code into a Medusa app as regular app code.
//
//   node scripts/vendor-into-app.mjs <path-to-medusa-backend> [--only=<plugin-folder>] [--dry-run] [--force]
//
// What it does, per plugin:
//  - copies every namespaced file under src/ (modules/<ns>, providers/<ns>,
//    workflows/<ns>, lib/<ns>, api/*/<ns>, admin/**/<ns>, and files named
//    "<ns>-*" in jobs/, subscribers/, links/, admin/widgets/) to the same
//    path in the app, with a GENERATED header; tests are skipped
//  - first removes the files it copied last time (tracked in
//    .medusa-integrations.json in the app root)
//  - regenerates src/api/middlewares.ts and src/admin/i18n/index.ts so they
//    merge the routes and translations of every vendored plugin with the
//    app's own (an existing hand-written file is moved to
//    middlewares.app.ts / i18n/app.ts and imported from there)
//
// Files without a GENERATED header that the script did not create are never
// overwritten or deleted; the script stops and lists them instead (--force
// overrides that for files listed in the manifest).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import { GENERATED_MARKER, headerFor, listPlugins, readJson, toLf, walk } from "./lib.mjs"

const args = process.argv.slice(2)
const appArg = args.find((arg) => !arg.startsWith("--"))
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length)
const dryRun = args.includes("--dry-run")
const force = args.includes("--force")

if (!appArg) {
  console.error(
    "Usage: node scripts/vendor-into-app.mjs <path-to-medusa-backend> [--only=<plugin>] [--dry-run] [--force]"
  )
  process.exit(2)
}

const APP = resolve(appArg)
const MANIFEST = join(APP, ".medusa-integrations.json")
const MIDDLEWARES = "src/api/middlewares.ts"
const APP_MIDDLEWARES = "src/api/middlewares.app.ts"
const I18N = "src/admin/i18n/index.ts"
const APP_I18N = "src/admin/i18n/app.ts"

/** Plugin files that exist only for the published package. */
const PACKAGE_ONLY = new Set([MIDDLEWARES, I18N, "src/admin/tsconfig.json", "src/admin/vite-env.d.ts"])

/* Preconditions ------------------------------------------------------------ */

if (
  !existsSync(join(APP, "package.json")) ||
  !["medusa-config.ts", "medusa-config.js"].some((f) => existsSync(join(APP, f)))
) {
  die(`${APP} does not look like a Medusa backend (needs package.json and medusa-config.ts)`)
}

const plugins = listPlugins().filter((plugin) => !only || plugin.folder === only)
if (!plugins.length) {
  die(only ? `No plugin folder named ${only}` : "No plugins found")
}

const manifest = existsSync(MANIFEST) ? readJson(MANIFEST) : { plugins: {} }
manifest.generatedBy = "medusa-integrations/scripts/vendor-into-app.mjs"
manifest.plugins ??= {}

/** Files copied by earlier runs, before this run changes the manifest. */
const previouslyVendored = new Set(Object.values(manifest.plugins).flatMap((entry) => entry.files ?? []))

const actions = []
/** Planned changes; nothing touches the app until every check has passed. */
const removals = []
/** Hand-written app files to move aside: [from, to]. */
const moves = []
const log = (message) => actions.push(message)

/* 1. Remove previous copies ------------------------------------------------ */

const blocked = []
for (const plugin of plugins) {
  for (const file of manifest.plugins[plugin.folder]?.files ?? []) {
    // The manifest lives in the app and can be edited, so a listed path is
    // only trusted when it is one this script would write, even with --force.
    if (!isVendorablePath(file, plugin.namespace)) {
      blocked.push(
        `${file} (listed in ${relative(APP, MANIFEST)}, but it is not a namespaced path under src/; remove it from the manifest)`
      )
      continue
    }
    const full = join(APP, file)
    if (!existsSync(full)) {
      continue
    }
    if (!isGenerated(full, file) && !force) {
      blocked.push(`${file} (listed as vendored, but its GENERATED header was removed; it may hold manual edits)`)
      continue
    }
    removals.push(file)
  }
}

/* 2. Copy each plugin ------------------------------------------------------ */

const writes = []

for (const plugin of plugins) {
  const pkg = readJson(join(plugin.dir, "package.json"))
  const files = walk(join(plugin.dir, "src"))
    .map((file) => `src/${file}`)
    .filter(
      (file) =>
        !PACKAGE_ONLY.has(file) && !file.split("/").includes("__tests__") && isNamespaced(file, plugin.namespace)
    )

  for (const file of files) {
    const target = join(APP, file)
    if (existsSync(target) && !previouslyVendored.has(file) && !isGenerated(target, file)) {
      blocked.push(`${file} (the app already has its own file here)`)
      continue
    }
    const source = toLf(readFileSync(join(plugin.dir, file), "utf8"))
    writes.push({
      file,
      content: withHeader(
        file,
        source,
        `vendored from plugins/${plugin.folder}/${file} (${pkg.name}@${pkg.version}) by scripts/vendor-into-app.mjs. Do not edit by hand; change the plugin and re-run the script.`
      ),
    })
  }

  const middlewares = `src/lib/${plugin.namespace}/api/middlewares.ts`
  const middlewareExport = `${camel(plugin.namespace)}Middlewares`
  const hasMiddlewares =
    existsSync(join(plugin.dir, middlewares)) &&
    new RegExp(`export const ${middlewareExport}\\b`).test(readFileSync(join(plugin.dir, middlewares), "utf8"))

  const i18nDir = join(plugin.dir, "src/admin/i18n", plugin.namespace)
  const languages = existsSync(i18nDir)
    ? readdirSync(i18nDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5))
    : []

  manifest.plugins[plugin.folder] = {
    package: pkg.name,
    version: pkg.version,
    namespace: plugin.namespace,
    middlewares: hasMiddlewares ? { file: middlewares, export: middlewareExport } : null,
    languages,
    files: files.filter((file) => !blocked.some((line) => line.startsWith(`${file} `))),
  }
}

if (blocked.length) {
  die(
    `Stopped without changing anything. These files need a decision first:\n${blocked.map((b) => `  - ${b}`).join("\n")}`
  )
}

/* 3. Merge middlewares and translations ------------------------------------ */

const vendored = Object.values(manifest.plugins)

const middlewarePlugins = vendored.filter((entry) => entry.middlewares)
if (middlewarePlugins.length) {
  const appFile = adoptHandWritten(MIDDLEWARES, APP_MIDDLEWARES)
  const imports = middlewarePlugins.map(
    (entry) => `import { ${entry.middlewares.export} } from "${importPath(MIDDLEWARES, entry.middlewares.file)}"`
  )
  const spread = middlewarePlugins.map((entry) => `...${entry.middlewares.export}`)
  const body = appFile
    ? `import appMiddlewares from "./middlewares.app"\n${imports.join("\n")}\n\nexport default defineMiddlewares({\n  ...appMiddlewares,\n  routes: [...(appMiddlewares.routes ?? []), ${spread.join(", ")}],\n})\n`
    : `${imports.join("\n")}\n\nexport default defineMiddlewares({\n  routes: [${spread.join(", ")}],\n})\n`
  writes.push({
    file: MIDDLEWARES,
    content: withHeader(
      MIDDLEWARES,
      `import { defineMiddlewares } from "@medusajs/framework/http"\n\n${body}`,
      mergedNote(APP_MIDDLEWARES)
    ),
  })
}

const i18nPlugins = vendored.filter((entry) => entry.languages?.length)
if (i18nPlugins.length) {
  const appFile = adoptHandWritten(I18N, APP_I18N)
  const imports = []
  const sources = []
  if (appFile) {
    imports.push(`import app from "./app"`)
    sources.push("app as Resources")
  }
  for (const entry of i18nPlugins) {
    const pairs = entry.languages.map((lang) => {
      const name = `${camel(entry.namespace)}${lang.replace(/[^a-z0-9]/gi, "_")}`
      imports.push(`import ${name} from "./${entry.namespace}/${lang}.json" with { type: "json" }`)
      return `${JSON.stringify(lang)}: { translation: ${name} }`
    })
    sources.push(`{ ${pairs.join(", ")} }`)
  }
  const content = `${imports.join("\n")}

type Resources = Record<string, { translation: Record<string, unknown> }>

/** Each integration keeps its strings under its own top-level key, so a shallow merge per language is enough. */
function merge(...all: Resources[]): Resources {
  const result: Resources = {}
  for (const resources of all) {
    for (const [lang, { translation }] of Object.entries(resources)) {
      result[lang] = { translation: { ...result[lang]?.translation, ...translation } }
    }
  }
  return result
}

export default merge(${sources.join(", ")})
`
  writes.push({ file: I18N, content: withHeader(I18N, content, mergedNote(APP_I18N)) })
}

/* 4. Write ----------------------------------------------------------------- */

const written = new Set(writes.map((w) => w.file))
for (const file of removals) {
  if (written.has(file)) {
    continue // overwritten below
  }
  log(`remove ${file}`)
  if (!dryRun) {
    rmSync(join(APP, file))
  }
}

for (const [from, to] of moves) {
  log(`move   ${from} -> ${to} (your own file, now imported by the generated one)`)
  if (!dryRun) {
    renameSync(join(APP, from), join(APP, to))
  }
}

for (const { file, content } of writes) {
  log(`write  ${file}`)
  if (!dryRun) {
    mkdirSync(dirname(join(APP, file)), { recursive: true })
    writeFileSync(join(APP, file), content)
  }
}
if (!dryRun) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n")
  removeEmptyDirs(join(APP, "src"))
}

console.log(actions.join("\n"))
console.log(`\n${dryRun ? "[dry run] " : ""}Vendored ${plugins.map((p) => p.folder).join(", ")} into ${APP}`)
printNextSteps()

/* Helpers ------------------------------------------------------------------ */

function die(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

/** A path relative to the app, under its `src/`, that belongs to the plugin's namespace. */
function isVendorablePath(file, namespace) {
  if (typeof file !== "string" || !file.startsWith("src/") || file.includes("\\")) return false
  const segments = file.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false
  return isNamespaced(file, namespace)
}

function isNamespaced(file, namespace) {
  const segments = file.split("/")
  return segments.slice(1, -1).includes(namespace) || segments.at(-1).startsWith(`${namespace}-`)
}

/** Generated files carry the marker; JSON cannot, so it counts as generated when the manifest lists it. */
function isGenerated(full, file) {
  if (!headerFor(file, "")) {
    return previouslyVendored.has(file)
  }
  return readFileSync(full, "utf8").split("\n", 1)[0].includes(GENERATED_MARKER)
}

/** Replaces an existing generated header (e.g. a kit copy's) with the vendoring one. */
function withHeader(file, source, text) {
  const header = headerFor(file, text)
  if (!header) {
    return source
  }
  const lines = source.split("\n")
  const body = lines[0].includes(GENERATED_MARKER) ? lines.slice(1).join("\n") : source
  return header + body
}

/** Moves a hand-written app file aside so the generated one can import it. Returns true when an app file exists. */
function adoptHandWritten(file, appFile) {
  const full = join(APP, file)
  if (existsSync(full) && !readFileSync(full, "utf8").includes(GENERATED_MARKER)) {
    if (existsSync(join(APP, appFile))) {
      die(`Both ${file} (hand-written) and ${appFile} exist. Merge them into ${appFile} and delete ${file}.`)
    }
    moves.push([file, appFile])
    return true
  }
  return existsSync(join(APP, appFile))
}

function mergedNote(appFile) {
  return `merges every vendored integration, written by scripts/vendor-into-app.mjs. Do not edit by hand; put your own entries in ${appFile.split("/").at(-1)}.`
}

function importPath(fromFile, toFile) {
  let path = relative(dirname(fromFile), toFile)
    .split("\\")
    .join("/")
    .replace(/\.tsx?$/, "")
  return path.startsWith(".") ? path : `./${path}`
}

function camel(text) {
  return text.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
}

function removeEmptyDirs(dir) {
  if (!existsSync(dir)) {
    return
  }
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      removeEmptyDirs(join(dir, name.name))
    }
  }
  if (!readdirSync(dir).length) {
    rmdirSync(dir)
  }
}

function printNextSteps() {
  const appPkg = readJson(join(APP, "package.json"))
  const installed = { ...appPkg.dependencies, ...appPkg.devDependencies }
  console.log("\nNext steps in the app:")
  for (const plugin of plugins) {
    const pkg = readJson(join(plugin.dir, "package.json"))
    const needed = { ...pkg.peerDependencies, ...pkg.dependencies }
    const missing = Object.entries(needed).filter(([name]) => !installed[name])
    console.log(`\n  ${plugin.folder}:`)
    if (existsSync(join(plugin.dir, "src/modules", plugin.namespace))) {
      console.log(
        `   - register the module in medusa-config.ts: { resolve: "./src/modules/${plugin.namespace}", options }`
      )
    }
    // One provider at providers/<ns>, or several at providers/<ns>/<name>.
    const providersDir = join(plugin.dir, "src/providers", plugin.namespace)
    if (existsSync(providersDir)) {
      const nested = existsSync(join(providersDir, "index.ts"))
        ? []
        : readdirSync(providersDir).filter((name) => existsSync(join(providersDir, name, "index.ts")))
      for (const name of nested.length ? nested : [null]) {
        const path = name ? `${plugin.namespace}/${name}` : plugin.namespace
        console.log(
          `   - register the provider under its Medusa module: { resolve: "./src/providers/${path}", id: "${name ?? plugin.namespace}", options }`
        )
      }
    }
    console.log("   - remove the npm package from plugins: [...] if it was installed before")
    if (missing.length) {
      console.log(`   - install: npm install ${missing.map(([name, range]) => `${name}@"${range}"`).join(" ")}`)
    }
  }
  console.log("\n  Then run: npx medusa db:migrate")
}
