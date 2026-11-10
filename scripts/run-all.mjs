#!/usr/bin/env node
// Runs a command in every plugins/* folder, in order, and stops on the first failure.
//
//   node scripts/run-all.mjs npm run build
//   node scripts/run-all.mjs --only=medusa-plugin-apaczka npm test
import { listPlugins, run } from "./lib.mjs"

const args = process.argv.slice(2)
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length)
const command = args.filter((arg) => !arg.startsWith("--only="))

if (!command.length) {
  console.error("Usage: node scripts/run-all.mjs [--only=<plugin-folder>] <command> [args...]")
  process.exit(2)
}

const plugins = listPlugins().filter((plugin) => !only || plugin.folder === only)
if (!plugins.length) {
  console.error(only ? `No plugin folder named ${only}` : "No plugins found in plugins/")
  process.exit(1)
}

for (const plugin of plugins) {
  console.log(`\n▶ ${plugin.folder}: ${command.join(" ")}`)
  const code = run(command[0], command.slice(1), { cwd: plugin.dir })
  if (code !== 0) {
    console.error(`\n✖ ${plugin.folder}: "${command.join(" ")}" failed with exit code ${code}`)
    process.exit(code)
  }
}

console.log(`\n✔ ${command.join(" ")} passed in ${plugins.length} plugin(s)`)
