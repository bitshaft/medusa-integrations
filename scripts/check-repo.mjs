#!/usr/bin/env node
// Checks the repo rules from CLAUDE.md. Exits 1 and lists every problem it finds.
//
// Per plugin: name and folder, keywords, publishConfig, peer dependencies,
// published files, README and LICENSE, own lockfile, scripts, namespacing,
// kit copies up to date.
// Repo-wide: no workspaces, no .env files or keys in git, no secrets in files.
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { listPlugins, PLUGIN_PREFIX, readJson, ROOT, SCOPE, walk } from "./lib.mjs"

const REQUIRED_KEYWORDS = ["medusa-v2", "medusa-plugin-integration"]
/**
 * Plugins that talk to no third-party service set `"bitshaft": { "integration": false }`
 * in package.json. They need only these keywords, and no category keyword.
 */
const NON_INTEGRATION_KEYWORDS = ["medusa-v2", "medusa-plugin"]
/** An integration must have at least one category keyword. */
const CATEGORY_KEYWORDS = [
  "medusa-plugin-shipping",
  "medusa-plugin-fulfillment",
  "medusa-plugin-payment",
  "medusa-plugin-notification",
  "medusa-plugin-search",
  "medusa-plugin-analytics",
  "medusa-plugin-storage",
  "medusa-plugin-auth",
  "medusa-plugin-cms",
  "medusa-plugin-erp",
  "medusa-plugin-marketing",
  "medusa-plugin-tax",
  "medusa-plugin-other",
]
/** Provided by the host Medusa app: peer dependencies, never bundled. */
const HOST_PROVIDED = [
  "@medusajs/framework",
  "@medusajs/medusa",
  "@medusajs/admin-sdk",
  "@medusajs/ui",
  "@medusajs/icons",
  "@medusajs/js-sdk",
  "@tanstack/react-query",
]
const ALWAYS_PEER = ["@medusajs/framework", "@medusajs/medusa"]
/** Tooling: devDependencies only. */
const DEV_ONLY = ["@medusajs/cli", "@medusajs/test-utils"]
/** Allowed entries in package.json "files" (negations are always allowed). */
const PUBLISHED_FILES = [".medusa/server", "README.md", "LICENSE", "CHANGELOG.md"]
/** Files Medusa needs at fixed, un-namespaced paths. */
const UNNAMESPACED_ALLOWED = [
  "src/api/middlewares.ts",
  "src/admin/i18n/index.ts",
  "src/admin/tsconfig.json",
  "src/admin/vite-env.d.ts",
]

const problems = []
const fail = (where, message) => problems.push(`${where}: ${message}`)

/* Plugins ------------------------------------------------------------------ */

const plugins = listPlugins()
if (!plugins.length) {
  fail("plugins/", "no plugins found")
}

for (const plugin of plugins) {
  const where = `plugins/${plugin.folder}`
  const pkgPath = join(plugin.dir, "package.json")
  if (!existsSync(pkgPath)) {
    fail(where, "missing package.json")
    continue
  }
  const pkg = readJson(pkgPath)

  if (!plugin.folder.startsWith(PLUGIN_PREFIX)) {
    fail(where, `folder name must start with "${PLUGIN_PREFIX}"`)
  }
  if (pkg.name !== `${SCOPE}/${plugin.folder}`) {
    fail(where, `package name must be "${SCOPE}/${plugin.folder}" (found "${pkg.name}")`)
  }
  if (!/^\d+\.\d+\.\d+/.test(pkg.version ?? "")) {
    fail(where, "package.json needs a semver version")
  }
  if (pkg.private) {
    fail(where, "package.json must not be private")
  }
  if (pkg.license !== "MIT") {
    fail(where, 'license must be "MIT"')
  }
  if (pkg.workspaces) {
    fail(where, "npm workspaces are not allowed")
  }

  const keywords = pkg.keywords ?? []
  const integration = pkg.bitshaft?.integration !== false
  for (const keyword of integration ? REQUIRED_KEYWORDS : NON_INTEGRATION_KEYWORDS) {
    if (!keywords.includes(keyword)) {
      fail(where, `missing keyword "${keyword}"`)
    }
  }
  if (integration && !keywords.some((keyword) => CATEGORY_KEYWORDS.includes(keyword))) {
    fail(where, `needs a category keyword, one of: ${CATEGORY_KEYWORDS.join(", ")}`)
  }
  if (!integration && keywords.includes("medusa-plugin-integration")) {
    fail(where, '"bitshaft.integration" is false, so the keyword "medusa-plugin-integration" must not be used')
  }

  if (pkg.publishConfig?.access !== "public") {
    fail(where, 'publishConfig must be { "access": "public" }')
  }

  // Dependencies
  const deps = pkg.dependencies ?? {}
  const peers = pkg.peerDependencies ?? {}
  const devDeps = pkg.devDependencies ?? {}
  for (const name of ALWAYS_PEER) {
    if (!peers[name]) {
      fail(where, `missing peer dependency ${name}`)
    }
  }
  for (const name of HOST_PROVIDED) {
    if (deps[name]) {
      fail(where, `${name} is provided by the Medusa app; move it from dependencies to peerDependencies`)
    }
  }
  for (const name of DEV_ONLY) {
    if (peers[name] || deps[name]) {
      fail(where, `${name} is tooling; it belongs in devDependencies only`)
    }
  }
  for (const name of Object.keys(peers)) {
    if (!devDeps[name]) {
      fail(where, `peer dependency ${name} should also be a devDependency so tests and builds use a pinned version`)
    }
  }
  const imported = importedPackages(join(plugin.dir, "src"))
  for (const name of HOST_PROVIDED) {
    if (imported.has(name) && !peers[name]) {
      fail(where, `src imports ${name}; declare it in peerDependencies`)
    }
  }

  // Published files
  const files = pkg.files ?? []
  if (!files.includes(".medusa/server")) {
    fail(where, 'package.json "files" must include ".medusa/server"')
  }
  for (const entry of files) {
    if (!entry.startsWith("!") && !PUBLISHED_FILES.includes(entry)) {
      fail(where, `"files" may only list build output and docs (${PUBLISHED_FILES.join(", ")}); found "${entry}"`)
    }
  }

  // Docs and lockfile
  for (const file of ["README.md", "LICENSE", "package-lock.json"]) {
    if (!existsSync(join(plugin.dir, file))) {
      fail(where, `missing ${file}`)
    }
  }
  if (existsSync(join(plugin.dir, "LICENSE"))) {
    const license = readFileSync(join(plugin.dir, "LICENSE"), "utf8")
    if (!license.includes("MIT License") || !license.includes("Copyright (c) 2026 Bitshaft")) {
      fail(where, 'LICENSE must be MIT with "Copyright (c) 2026 Bitshaft"')
    }
  }

  // Scripts
  const scripts = pkg.scripts ?? {}
  if (!/medusa plugin:build/.test(scripts.build ?? "")) {
    fail(where, 'scripts.build must run "medusa plugin:build"')
  }
  if (!/strip-source-maps/.test(scripts.build ?? "")) {
    fail(where, 'scripts.build must end with "node scripts/kit/strip-source-maps.mjs" (no source maps in the package)')
  }
  for (const name of ["check", "typecheck", "test"]) {
    if (!scripts[name]) {
      fail(where, `missing script "${name}"`)
    }
  }

  // Namespacing: every file under src/ lives under the plugin's namespace.
  for (const file of walk(join(plugin.dir, "src")).map((f) => `src/${f}`)) {
    if (UNNAMESPACED_ALLOWED.includes(file)) {
      continue
    }
    const segments = file.split("/")
    const base = segments.at(-1)
    const namespaced = segments.slice(1, -1).includes(plugin.namespace) || base.startsWith(`${plugin.namespace}-`)
    if (!namespaced) {
      fail(
        where,
        `${file} is not namespaced; put it under a "${plugin.namespace}/" folder or prefix it "${plugin.namespace}-"`
      )
    }
  }
}

// Kit copies
{
  const result = spawnSync(process.execPath, [join(ROOT, "scripts/kit-sync.mjs"), "--check"], { encoding: "utf8" })
  if (result.status !== 0) {
    fail("kit", `copies are out of date (run npm run kit:sync)\n${result.stderr.trim()}`)
  }
}

/* Repo --------------------------------------------------------------------- */

const rootPkg = readJson(join(ROOT, "package.json"))
if (rootPkg.workspaces) {
  fail("package.json", "npm workspaces are not allowed; each plugin installs on its own")
}
if (rootPkg.dependencies && Object.keys(rootPkg.dependencies).length) {
  fail("package.json", "the root package must not have dependencies")
}
for (const file of ["README.md", "LICENSE", "TRADEMARKS.md", "CLAUDE.md", ".nvmrc", ".gitignore"]) {
  if (!existsSync(join(ROOT, file))) {
    fail("repo", `missing ${file}`)
  }
}

const repoFiles = gitFiles()

const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/
const ENV_ALLOWED = /(^|\/)\.env\.(template|example)$/
const KEY_FILE = /\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519)$|(^|\/)\.npmrc$/
for (const file of repoFiles) {
  if (ENV_FILE.test(file) && !ENV_ALLOWED.test(file)) {
    fail(file, ".env files must not be committed (only .env.template / .env.example)")
  }
  if (KEY_FILE.test(file)) {
    fail(file, "key and credential files must not be committed")
  }
}

const SECRET_PATTERNS = [
  [/npm_[A-Za-z0-9]{36}/, "npm token"],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/github_pat_[A-Za-z0-9_]{40,}/, "GitHub token"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\b(sk|rk)_live_[A-Za-z0-9]{16,}/, "live API key"],
  [/\bsk-(ant|proj)-[A-Za-z0-9_-]{20,}/, "AI API key"],
  [
    /\b[A-Za-z_]*(secret|token|password|passwd|api_?key|app_?id)["']?\s*[:=]\s*["'][A-Za-z0-9+/=_.-]{16,}["']/i,
    "hardcoded credential",
  ],
]
const ALLOW_MARKER = "check-repo: allow-secret"
const SKIP_CONTENT = /(^|\/)package-lock\.json$|\.(png|jpe?g|gif|ico|pdf|woff2?|ttf|zip|tgz)$/

// Values from local, ignored .env files must never appear in tracked files.
const localSecrets = localEnvValues()

for (const file of repoFiles) {
  if (SKIP_CONTENT.test(file)) {
    continue
  }
  const full = join(ROOT, file)
  if (!existsSync(full) || statSync(full).size > 2_000_000) {
    continue
  }
  const lines = readFileSync(full, "utf8").split("\n")
  lines.forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) {
      return
    }
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        fail(`${file}:${index + 1}`, `looks like a ${label}`)
      }
    }
    for (const { name, value } of localSecrets) {
      if (line.includes(value)) {
        fail(`${file}:${index + 1}`, `contains the value of ${name} from a local .env file`)
      }
    }
  })
}

/* Report ------------------------------------------------------------------- */

if (problems.length) {
  console.error(`check-repo found ${problems.length} problem(s):\n`)
  console.error(problems.map((line) => `  - ${line}`).join("\n"))
  process.exit(1)
}
console.log(`check-repo passed: ${plugins.length} plugin(s), ${repoFiles.length} files scanned.`)

/* Helpers ------------------------------------------------------------------ */

/** Tracked files plus new files git would pick up (not ignored). */
function gitFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: ROOT,
      encoding: "utf8",
    })
    return [...new Set(out.split("\0").filter(Boolean))].filter((file) => existsSync(join(ROOT, file)))
  } catch {
    return walk(ROOT, { skip: ["node_modules", ".git", ".medusa", "coverage", ".smoke"] })
  }
}

/** Bare package names imported anywhere under `dir`. */
function importedPackages(dir) {
  const names = new Set()
  for (const file of walk(dir)) {
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) {
      continue
    }
    const source = readFileSync(join(dir, file), "utf8")
    for (const match of source.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"'.][^"']*)["']/g)) {
      const spec = match[1]
      if (spec.startsWith("node:")) {
        continue
      }
      const parts = spec.split("/")
      names.add(spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0])
    }
  }
  return names
}

/** `{ name, value }` for every non-trivial value in ignored .env files of the repo and its plugins. */
function localEnvValues() {
  const dirs = [ROOT, ...plugins.map((plugin) => plugin.dir)]
  const values = []
  for (const dir of dirs) {
    const file = join(dir, ".env")
    if (!existsSync(file)) {
      continue
    }
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?/.exec(line)
      const value = match?.[2]?.trim()
      // Short values and plain words (e.g. "sandbox") are not secrets.
      if (match && value && value.length >= 12 && !/^[a-z]+$/.test(value)) {
        values.push({ name: match[1], value })
      }
    }
  }
  return values
}
