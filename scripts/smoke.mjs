#!/usr/bin/env node
// Verifies that each plugin's published package actually works:
//
//  1. builds the plugin (if needed) and runs `npm pack`
//  2. checks the tarball holds only build output (no src, tests or source maps)
//  3. installs the tarball into a fresh, minimal Medusa app in .smoke/
//  4. loads every entry point in the package's "exports"
//  5. runs `medusa build` in the app (backend and admin, with the plugin)
//  6. with DATABASE_URL set: `medusa db:migrate`, then boots the app and waits for /health
//
//   node scripts/smoke.mjs [--only=<plugin-folder>] [--keep]
//
// The app is registered without plugin options on purpose: it must still
// start, with the plugin disabled (see "Quality rules" in CLAUDE.md), unless
// the plugin needs no options (`"bitshaft": { "requiresOptions": false }`).
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { listPlugins, readJson, ROOT, run, walk } from "./lib.mjs"

const args = process.argv.slice(2)
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length)
const keep = args.includes("--keep")
const SMOKE_DIR = join(ROOT, ".smoke")

const plugins = listPlugins().filter((plugin) => !only || plugin.folder === only)
if (!plugins.length) {
  console.error(only ? `No plugin folder named ${only}` : "No plugins found")
  process.exit(1)
}

const step = (message) => console.log(`\n▶ ${message}`)
const die = (message) => {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

for (const plugin of plugins) {
  const pkg = readJson(join(plugin.dir, "package.json"))
  const work = join(SMOKE_DIR, plugin.folder)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  /* 1. Build and pack ----------------------------------------------------- */
  if (!existsSync(join(plugin.dir, ".medusa/server"))) {
    step(`${plugin.folder}: building`)
    if (run("npm", ["run", "build"], { cwd: plugin.dir }) !== 0) {
      die(`${plugin.folder}: build failed`)
    }
  }

  step(`${plugin.folder}: npm pack`)
  if (
    run("npm", ["pack", "--pack-destination", work, "--json", "--silent"], {
      cwd: plugin.dir,
      stdio: ["ignore", "ignore", "inherit"],
    }) !== 0
  ) {
    die(`${plugin.folder}: npm pack failed`)
  }
  const tarball = readdirSync(work).find((file) => file.endsWith(".tgz"))
  if (!tarball) {
    die(`${plugin.folder}: npm pack produced no tarball`)
  }

  /* 2. Tarball contents --------------------------------------------------- */
  step(`${plugin.folder}: checking tarball contents`)
  const listing = await capture("tar", ["-tzf", tarball], { cwd: work })
  const entries = listing
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry.replace(/^package\//, ""))
  const forbidden = entries.filter(
    (entry) =>
      entry.endsWith(".map") ||
      entry.includes("__tests__") ||
      entry.startsWith("src/") ||
      entry.startsWith("integration-tests/") ||
      entry.startsWith("storefront/") ||
      /(^|\/)\.env/.test(entry) ||
      (/\.tsx?$/.test(entry) && !entry.endsWith(".d.ts"))
  )
  const outside = entries.filter(
    (entry) =>
      !entry.startsWith(".medusa/server/") && !["package.json", "README.md", "LICENSE", "CHANGELOG.md"].includes(entry)
  )
  if (forbidden.length || outside.length) {
    die(
      `${plugin.folder}: tarball has files it must not ship:\n${[...forbidden, ...outside].map((e) => `  - ${e}`).join("\n")}`
    )
  }
  console.log(`  ${entries.length} files, all build output or docs`)

  /* 3. Fresh app ---------------------------------------------------------- */
  step(`${plugin.folder}: creating a fresh Medusa app`)
  const app = join(work, "app")
  mkdirSync(join(app, "src"), { recursive: true })
  const dev = pkg.devDependencies ?? {}
  const pin = (name, fallback) => dev[name] ?? pkg.peerDependencies?.[name] ?? fallback
  const medusaVersion = pin("@medusajs/medusa", "latest")
  const dependencies = {
    "@medusajs/framework": pin("@medusajs/framework", medusaVersion),
    "@medusajs/medusa": medusaVersion,
    "@medusajs/cli": pin("@medusajs/cli", medusaVersion),
    "@medusajs/admin-sdk": pin("@medusajs/admin-sdk", medusaVersion),
    "@medusajs/js-sdk": pin("@medusajs/js-sdk", medusaVersion),
    "@medusajs/icons": pin("@medusajs/icons", medusaVersion),
    "@medusajs/ui": pin("@medusajs/ui", "latest"),
    "@tanstack/react-query": pin("@tanstack/react-query", "latest"),
    react: pin("react", "^18.3.1"),
    "react-dom": pin("react-dom", "^18.3.1"),
    [pkg.name]: `file:../${tarball}`,
  }
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify(
      {
        name: `smoke-${plugin.namespace}`,
        private: true,
        scripts: { build: "medusa build", start: "medusa start" },
        dependencies,
        devDependencies: {
          typescript: dev.typescript ?? "^5.6.2",
          "@types/node": dev["@types/node"] ?? "^20.0.0",
          "ts-node": dev["ts-node"] ?? "^10.9.2",
          "@swc/core": dev["@swc/core"] ?? "^1.7.28",
          vite: dev.vite ?? "^7.0.0",
        },
      },
      null,
      2
    )
  )
  writeFileSync(
    join(app, "medusa-config.ts"),
    `import { defineConfig } from "@medusajs/framework/utils"

// No plugin options on purpose: the plugin must load disabled, not crash.
export default defineConfig({
  // The admin bundle is compiled by \`medusa build\`; the boot check only
  // needs the server (a production start would look for the admin build
  // under .medusa/server, not in the app).
  admin: { disable: process.env.SMOKE_BOOT === "true" },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: "http://localhost:8000",
      adminCors: "http://localhost:9000",
      authCors: "http://localhost:9000",
      jwtSecret: "smoke-test-only",
      cookieSecret: "smoke-test-only",
    },
  },
  plugins: [{ resolve: "${pkg.name}", options: {} }],
})
`
  )
  writeFileSync(
    join(app, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2021",
          module: "Node16",
          moduleResolution: "Node16",
          esModuleInterop: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          outDir: "./.medusa/server",
          rootDir: "./",
          jsx: "react-jsx",
          resolveJsonModule: true,
        },
        include: ["**/*", ".medusa/types/*"],
        exclude: ["node_modules", ".medusa/server", ".medusa/admin", ".cache"],
      },
      null,
      2
    )
  )
  writeFileSync(join(app, "src/README.md"), "Smoke test app. Generated by scripts/smoke.mjs.\n")

  step(`${plugin.folder}: npm install in the app (this takes a while)`)
  if (run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: app }) !== 0) {
    die(`${plugin.folder}: npm install of the tarball failed`)
  }

  // File names were checked above; also make sure no inline source map slipped through.
  const installed = join(app, "node_modules", ...pkg.name.split("/"))
  const withMaps = walk(installed).filter(
    (file) => /.(c|m)?js$/.test(file) && /sourceMappingURL=/.test(readFileSync(join(installed, file), "utf8"))
  )
  if (withMaps.length) {
    die(`${plugin.folder}: ${withMaps.length} files still carry source maps, e.g. ${withMaps[0]}`)
  }

  /* 4. Load every export -------------------------------------------------- */
  step(`${plugin.folder}: loading package entry points`)
  const subpaths = Object.keys(pkg.exports ?? { ".": "" }).filter((key) => !key.includes("*"))
  const wildcards = Object.keys(pkg.exports ?? {}).filter((key) => key.includes("*"))
  // Expand "./modules/*" and "./providers/*" with the plugin's namespace.
  for (const key of wildcards) {
    if (/^\.\/(modules|providers)\/\*$/.test(key)) {
      subpaths.push(key.replace("*", plugin.namespace))
    }
  }
  const loader = `
const results = []
for (const subpath of ${JSON.stringify(subpaths)}) {
  const id = ${JSON.stringify(pkg.name)} + subpath.slice(1)
  if (subpath === "./admin") {
    // The admin bundle is ESM for the dashboard's Vite build; resolving it is enough here.
    require.resolve(id)
    results.push(subpath + " (resolved)")
    continue
  }
  const mod = require(id)
  if (subpath.startsWith("./modules/") && !(mod.default && mod.default.service)) throw new Error(subpath + ": no module definition")
  if (subpath.startsWith("./providers/") && !(mod.default && mod.default.services)) throw new Error(subpath + ": no provider definition")
  results.push(subpath)
}
console.log("  loaded: " + results.join(", "))
`
  writeFileSync(join(app, "load-exports.cjs"), loader)
  if (run(process.execPath, ["load-exports.cjs"], { cwd: app, shell: false }) !== 0) {
    die(`${plugin.folder}: an entry point failed to load`)
  }

  /* 5. medusa build ------------------------------------------------------- */
  step(`${plugin.folder}: medusa build (backend and admin)`)
  if (run("npx", ["medusa", "build"], { cwd: app }) !== 0) {
    die(`${plugin.folder}: medusa build failed in the app`)
  }

  /* 6. Database: migrate and boot ---------------------------------------- */
  if (process.env.DATABASE_URL) {
    step(`${plugin.folder}: medusa db:migrate`)
    // The database is shared by every plugin's run (one Postgres in CI), so it
    // holds link tables of plugins that are not installed here. Without a
    // flag, db:migrate stops to ask whether to drop them and never returns.
    // Safe actions create this plugin's links and leave the others alone.
    if (run("npx", ["medusa", "db:migrate", "--execute-safe-links"], { cwd: app }) !== 0) {
      die(`${plugin.folder}: migrations failed`)
    }
    step(`${plugin.folder}: booting the app`)
    // A plugin that works without options (`"bitshaft": { "requiresOptions": false }`)
    // must start enabled; every other one must start disabled with one notice.
    await boot(app, pkg.bitshaft?.requiresOptions === false ? 0 : 1)
  } else {
    console.log("\n  DATABASE_URL not set: skipped migrations and boot.")
  }

  if (!keep) {
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\n✔ ${plugin.folder}: smoke test passed`)
}

/* Helpers ------------------------------------------------------------------ */

function capture(command, commandArgs, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { ...options, shell: false })
    let out = ""
    child.stdout.on("data", (chunk) => (out += chunk))
    child.stderr.pipe(process.stderr)
    child.on("error", reject)
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} exited with ${code}`))))
  })
}

/**
 * Starts the app, waits for /health, checks how many "Disabled" notices the
 * plugin logged (1 when it needs options, 0 when it runs without), then stops it.
 */
function boot(app, expectedDisabled) {
  const port = 9100 + Math.floor(Math.random() * 500)
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["medusa", "start"], {
      cwd: app,
      env: { ...process.env, PORT: String(port), NODE_ENV: "production", SMOKE_BOOT: "true" },
      shell: process.platform === "win32",
    })
    let log = ""
    child.stdout.on("data", (chunk) => (log += chunk))
    child.stderr.on("data", (chunk) => (log += chunk))

    const deadline = Date.now() + 120_000
    const stop = (error) => {
      clearInterval(timer)
      const finish = () => {
        if (error) {
          console.error(log.slice(-4000))
          reject(error)
        } else {
          resolve()
        }
      }
      if (child.exitCode !== null) {
        return finish()
      }
      // Wait until the server is really gone, so the app folder can be removed.
      child.once("close", finish)
      if (process.platform === "win32") {
        // With a shell, kill() only stops cmd.exe and leaves the server running.
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
      } else {
        child.kill()
      }
    }
    const timer = setInterval(async () => {
      if (child.exitCode !== null) {
        return stop(new Error(`medusa start exited with code ${child.exitCode}`))
      }
      if (Date.now() > deadline) {
        return stop(new Error("medusa start did not become healthy within 120 s"))
      }
      try {
        const response = await fetch(`http://localhost:${port}/health`)
        if (response.ok) {
          const disabledLines = log.split("\n").filter((line) => /\] Disabled: /.test(line))
          console.log(`  /health OK on port ${port}; disabled-notice lines: ${disabledLines.length}`)
          if (disabledLines.length !== expectedDisabled) {
            return stop(new Error(`expected ${expectedDisabled} "Disabled" log line(s), found ${disabledLines.length}`))
          }
          stop()
        }
      } catch {
        // not up yet
      }
    }, 1000)
  })
}
