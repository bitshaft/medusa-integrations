# medusa-integrations

A repository of independent Medusa v2 plugins by Bitshaft. Each folder in
`plugins/` is its own npm package, versioned and published on its own.

Everything in this repo is written in English: code, comments, commit
messages, docs and file contents. The only Polish allowed is the Polish
admin translations (`src/admin/i18n/<namespace>/pl.json`). Proper nouns in
test data (cities, streets, carrier service names) are fine.

## Layout

```
plugins/medusa-plugin-<name>/   one plugin = one npm package
kit/                            shared code, copied into every plugin by scripts/kit-sync.mjs
scripts/                        repo tooling (Node built-ins only, no dependencies)
.github/workflows/              CI and per-plugin publishing
```

## Repo rules

1. **Every plugin is independent.** It has its own `package.json`, its own
   `package-lock.json` and its own `node_modules`. No npm workspaces, and no
   imports between plugins or from outside the plugin folder. Each plugin is
   versioned and published on its own.
2. **Naming.** Folder `plugins/medusa-plugin-<name>`, package
   `@bitshaft/medusa-plugin-<name>`. In `package.json`:
   - `keywords` include `medusa-v2`, `medusa-plugin-integration` and one
     category keyword, e.g. `medusa-plugin-shipping`, `medusa-plugin-payment`,
     `medusa-plugin-notification` (the full list is in
     `scripts/check-repo.mjs`).
   - `publishConfig: { "access": "public" }` (`provenance: true` is fine).
   - `license: "MIT"`, and a `LICENSE` file with `Copyright (c) 2026 Bitshaft`.
   - **Peer dependencies: everything the host Medusa app provides** for the
     runtime and the admin. Never bundle these, never put them in
     `dependencies`:
     `@medusajs/framework`, `@medusajs/medusa` (always required),
     `@medusajs/admin-sdk`, `@medusajs/ui`, `@medusajs/icons`,
     `@medusajs/js-sdk`, `@tanstack/react-query` (whichever the plugin
     imports). Each peer is also a pinned devDependency.
   - **Tooling is devDependencies only:** `@medusajs/cli`,
     `@medusajs/test-utils`, test runners, linters.
   - **The package ships only build output.** `files` lists
     `.medusa/server` plus `README.md`, `LICENSE`, `CHANGELOG.md`. No `src`,
     tests or source maps. `medusa plugin:build` always emits source maps,
     so `build` is `medusa plugin:build && node scripts/kit/strip-source-maps.mjs`.
3. **Build and local testing.** Build with `npx medusa plugin:build`
   (`npm run build`). To try a plugin in an app: `npx medusa plugin:publish`
   in the plugin, then `npx medusa plugin:add @bitshaft/medusa-plugin-<name>`
   in the app. `npm run dev` (`medusa plugin:develop`) republishes on change.
4. **`kit/` is shared code, not a dependency.** It holds the HTTP client
   (timeouts, safe retries, secret masking in logs), plugin option helpers
   (disabled mode), package info, API route helpers and admin helpers.
   `npm run kit:sync` copies `kit/server` to `src/lib/<namespace>/kit/` and
   `kit/admin` to `src/admin/lib/<namespace>/kit/` and `kit/build` to
   `scripts/kit/` in every plugin. Copies
   start with a `GENERATED` header: **never edit them**, edit `kit/` and sync.
   `check:repo` fails when a copy is stale.
5. **Only genuinely generic code goes into `kit/`.** If only one
   integration needs it, or two would need it slightly differently, it stays
   in the plugin. Don't force it.
6. **Everything is namespaced** by the plugin name (`<namespace>` = folder
   name without `medusa-plugin-`), so a plugin can be copied into an app next
   to others without collisions:
   - folders: `src/modules/<ns>/`, `src/providers/<ns>/`,
     `src/workflows/<ns>/`, `src/lib/<ns>/`, `src/api/admin/<ns>/`,
     `src/api/store/<ns>/`, `src/api/hooks/<ns>/`,
     `src/admin/routes/**/<ns>/`, `src/admin/components/<ns>/`,
     `src/admin/lib/<ns>/`, `src/admin/i18n/<ns>/`
   - files: `src/jobs/<ns>-*.ts`, `src/subscribers/<ns>-*.ts`,
     `src/links/<ns>-*.ts`, `src/admin/widgets/<ns>-*.tsx`
   - identifiers: module name, provider `identifier`, job and subscriber ids,
     workflow and step names, event names (`<ns>.*`), translation keys (all
     under a top-level `"<ns>"` key)
   - the only un-namespaced files are the ones Medusa needs at fixed paths:
     `src/api/middlewares.ts` (only spreads `<camelNs>Middlewares` exported
     from `src/lib/<ns>/api/middlewares.ts`), `src/admin/i18n/index.ts`,
     `src/admin/tsconfig.json`, `src/admin/vite-env.d.ts`.
     `scripts/vendor-into-app.mjs` merges the first two across plugins.

## Naming conventions

| Thing                | Convention                                                  | Apaczka example                        |
| -------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Folder               | `plugins/medusa-plugin-<name>`                              | `plugins/medusa-plugin-apaczka`        |
| npm package          | `@bitshaft/medusa-plugin-<name>`                            | `@bitshaft/medusa-plugin-apaczka`      |
| Namespace            | `<name>` (kebab-case)                                       | `apaczka`                              |
| Module               | `src/modules/<ns>`, registered as `"<ns>"`                  | `APACZKA_MODULE = "apaczka"`           |
| Provider             | `src/providers/<ns>`, `static identifier = "<ns>"`          | `apaczka`                              |
| Data models          | PascalCase with the plugin prefix                           | `ApaczkaShipment`                      |
| Workflows / steps    | `<verb>-<ns>-<thing>` / `<ns>-<step>`                       | `create-apaczka-shipment`              |
| Jobs, subscribers    | file `<ns>-<what>.ts`, `name` / `subscriberId` the same     | `apaczka-sync-tracking`                |
| Events               | `<ns>.<entity>.<action>`                                    | `apaczka.shipment.delivered`           |
| API routes           | `/admin/<ns>/…`, `/store/<ns>/…`, `/hooks/<ns>/…`           | `/hooks/apaczka/tracking`              |
| Admin widget / route | `widgets/<ns>-<zone>.tsx` / `routes/settings/<ns>/page.tsx` | `apaczka-order-shipments.tsx`          |
| Log lines            | prefix `[<ns>]`                                             | `[apaczka] Disabled: missing option …` |
| Git tag (release)    | `<folder>@<version>`                                        | `medusa-plugin-apaczka@0.1.0`          |

## Quality rules

- **Secrets come only from plugin options or environment variables**, and
  never appear in logs, error messages or admin API responses. Register every
  secret with the kit HTTP client (`secrets: [...]`) so it is masked in logs
  and errors. Admin screens may show a masked identifier
  (`maskIdentifier`), never a secret.
- **No duplicates on retry.** Operations are idempotent: only read calls are
  retried automatically (`idempotent: true`). Before writing to an external
  system, check whether the write already happened (stored external id,
  lookup by reference). Workflow steps compensate what they did.
- **Missing options never break Medusa startup.** Parse options with
  `parsePluginOptions` (kit). When required options are missing or invalid,
  the plugin stays disabled and logs one line with `logPluginDisabled`
  (`[<ns>] Disabled: <reason>`). Routes answer with a clear "disabled"
  error, jobs and subscribers return quietly, provider option lists are
  empty, and the admin settings page shows the reason.
- **Admin UI in Polish and English.** Every string goes in both
  `src/admin/i18n/<ns>/en.json` and `pl.json`, under the `"<ns>"` key.
- Errors say what is wrong and how to fix it.
- Tests for behaviour changes; `npm run check` passes in every plugin.

## Adding a new plugin

1. **Scaffold.** Create `plugins/medusa-plugin-<name>` from the Medusa plugin
   starter (`npx create-medusa-app@latest --plugin`), or copy the structure of
   an existing plugin and delete its `src/`.
2. **package.json.** Set `name`, `version` (`0.1.0`), `description`,
   `license: "MIT"`, `author: "Bitshaft (https://bitshaft.pl)"`, the
   `repository` (`directory: "plugins/medusa-plugin-<name>"`), `keywords`,
   `publishConfig`, `files`, `peerDependencies` and devDependencies as in the
   rules above. Scripts: `build` (`medusa plugin:build`), `dev`, `typecheck`,
   `test`, and `check` (`npm run typecheck && npm test`).
3. **tsconfig.** Copy the Apaczka plugin's `tsconfig*.json` and
   `jest.config.js`.
4. **Namespace the code** as described above. Middleware routes go in
   `src/lib/<ns>/api/middlewares.ts` as `export const <camelNs>Middlewares`,
   and `src/api/middlewares.ts` only spreads them.
5. **Options.** Define a zod schema in `src/lib/<ns>/options.ts` and parse
   it with `parsePluginOptions(schema, raw, { required: [...] })`. Never
   throw from a module or provider constructor over options.
6. **HTTP.** Build the API client on the kit `HttpClient`, with all secrets
   in `secrets` and `idempotent: false` for writes.
7. **Admin.** Translations in `src/admin/i18n/<ns>/en.json` and `pl.json`;
   `src/admin/i18n/index.ts` imports them.
8. **Docs.** `README.md` with installation, configuration in
   `medusa-config.ts`, environment variables, what the plugin does and does
   not do, and how to test against the provider's sandbox. Add `LICENSE` (copy
   the root one), `CHANGELOG.md` and `.env.template` if it uses env vars.
   Add the plugin to the table in the root `README.md` and its dependency
   directory to `.github/dependabot.yml`.
9. **Sync and verify** from the repo root:
   ```bash
   npm run kit:sync
   npm run install:all     # creates the plugin's own package-lock.json
   npm run check
   npm run build
   npm run check:repo
   npm run smoke -- --only=medusa-plugin-<name>
   ```
10. **Release** by pushing a tag `medusa-plugin-<name>@<version>` (the
    version must match `package.json`). Before the first release, publish
    once by hand and configure npm trusted publishing for the package (see
    `CONTRIBUTING.md`).

## Root scripts

| Script                         |                                                                    |
| ------------------------------ | ------------------------------------------------------------------ |
| `npm run install:all`          | `npm install` in every plugin                                      |
| `npm run check`                | typecheck and unit tests in every plugin                           |
| `npm run build`                | `medusa plugin:build` in every plugin                              |
| `npm run kit:sync`             | copy `kit/` into every plugin                                      |
| `npm run check:repo`           | the rules above, plus no `.env` files or secrets in the repo       |
| `npm run smoke`                | `npm pack` each plugin and load it in a fresh Medusa app           |
| `npm run vendor -- <app path>` | copy every plugin into a Medusa backend as app code (by namespace) |

`scripts/run-all.mjs <command>` runs any command in every plugin and stops on
the first failure (`--only=<folder>` for one plugin).

## Things not to do

- Don't add npm workspaces or a root lockfile with dependencies.
- Don't import across plugins, or from `kit/` directly; use the synced copy.
- Don't edit files with a `GENERATED` header.
- Don't publish, tag or push from automation. Releases are cut by a person.
