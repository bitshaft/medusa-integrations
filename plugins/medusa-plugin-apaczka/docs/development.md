# Developing the Apaczka plugin

Repo-wide rules (naming, namespacing, kit, quality rules) are in
[CLAUDE.md](../../../CLAUDE.md) at the repository root. This page covers what
is specific to this plugin.

## Setup

```bash
cd plugins/medusa-plugin-apaczka
npm ci
npm run check            # typecheck + unit tests
npm run build            # medusa plugin:build
npm run lint
npm run format
```

Integration tests need Postgres (`DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`):

```bash
npm run test:integration
```

Sandbox tests need Apaczka sandbox credentials (see the
[README](../README.md#testing-against-the-apaczka-sandbox)):

```bash
APACZKA_SANDBOX_APP_ID=... APACZKA_SANDBOX_APP_SECRET=... npm run test:sandbox
```

### Trying it in a Medusa app

```bash
npm run dev                                              # here: rebuilds and publishes locally on change
npx medusa plugin:add @bitshaft/medusa-plugin-apaczka   # in your Medusa app
```

## Layout

Everything lives under the `apaczka` namespace so the code can be copied
into an app next to other integrations.

| Path                                                 |                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/apaczka/client/`                            | Apaczka API client. **No Medusa imports.** Signing, envelope, errors, types, statuses.               |
| `src/lib/apaczka/`                                   | Logic without container access: options, order builder, parcels, pricing, addresses, catalog cache.  |
| `src/lib/apaczka/api/`                               | Route helpers, request validators and the plugin's middleware routes (`apaczkaMiddlewares`).         |
| `src/lib/apaczka/kit/`, `src/admin/lib/apaczka/kit/` | **Generated** copies of the repo's `kit/`. Edit `kit/` at the root and run `npm run kit:sync` there. |
| `src/providers/apaczka/`                             | Fulfillment provider (rates, checkout validation, labels, cancel).                                   |
| `src/modules/apaczka/`                               | Shipment and tracking-event tables, and the client used by routes and jobs.                          |
| `src/workflows/apaczka/`                             | Create shipment, sync tracking, book pickup, mirror fulfillment state.                               |
| `src/api/{admin,store,hooks}/apaczka/`               | Admin, store and webhook routes. `src/api/middlewares.ts` only spreads `apaczkaMiddlewares`.         |
| `src/subscribers/apaczka-*`, `src/jobs/apaczka-*`    | Fulfillment and return events, tracking polling and catalog refresh.                                 |
| `src/links/apaczka-*`                                | Links from shipments to orders and fulfillments.                                                     |
| `src/admin/`                                         | Order widget, settings page, components and translations (`i18n/apaczka/en.json`, `pl.json`).        |
| `storefront/`                                        | Copy-in storefront kit (not in the npm package).                                                     |

## Conventions

- **Field names match the Apaczka wire format.** The API silently drops
  unknown keys, so a renamed field loses data instead of failing. Check the
  [API docs](https://api-docs.apaczka.pl) when adding fields.
- **Money:** grosze (integers) toward Apaczka, major units toward Medusa.
  Convert only with `src/lib/apaczka/money.ts`.
- **Never retry writes.** Use `idempotent: false` for anything that creates
  or changes state at Apaczka. On a timeout, look the order up before trying
  again.
- **Workflow steps compensate.** Each step that changes something undoes it
  in its compensation function.
- **Disabled mode.** Code that needs Apaczka gets the client through the
  module (`getClient()`, `getCatalog()`, `getOptions()`), which throws a clear
  "plugin is disabled" error when options are missing. Jobs and subscribers
  check `isEnabled()` first and return quietly.
- **Errors explain the fix.** Messages say what is wrong and how to fix it
  ("set `cod.bankAccount`…").
- **Admin strings** go in both `en.json` and `pl.json`, under the `apaczka`
  key.

## Releasing

Update `version` in `package.json` and `CHANGELOG.md`, merge to `main`, then
push a tag `medusa-plugin-apaczka@<version>`. The publish workflow builds,
checks and publishes this package only.
