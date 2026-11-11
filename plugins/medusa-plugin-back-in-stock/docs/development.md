# Developing the back-in-stock plugin

Repo-wide rules (naming, namespacing, kit, quality rules) are in
[CLAUDE.md](../../../CLAUDE.md) at the repository root. This page covers what
is specific to this plugin.

## Setup

```bash
cd plugins/medusa-plugin-back-in-stock
npm ci
npm run check            # typecheck (server, admin, storefront) + unit tests
npm run build            # medusa plugin:build
npm run lint
npm run format
```

Integration tests need Postgres (`DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`):

```bash
npm run test:integration
```

They apply the shipped migration and fail when it does not match the data
models, and they are the only tests of the SQL the module runs itself (the
atomic claim of a check, the ranking query), so run them after touching
`src/modules/back-in-stock/`.

### Trying it in a Medusa app

```bash
npm run dev                                                   # here: rebuilds and publishes locally on change
npx medusa plugin:add @bitshaft/medusa-plugin-back-in-stock   # in your Medusa app
```

Start with `demo: true` and the demo tools on the Settings tab.

## Layout

| Path                                                             |                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/back-in-stock/engine.ts`                                | Scheduling checks, running a check, notifying. Talks to storage through `EngineStore`.                  |
| `src/lib/back-in-stock/targets.ts`                               | Which variants an inventory event affects, and which of them someone waits for.                         |
| `src/lib/back-in-stock/availability.ts`                          | In stock or not, on top of Medusa's `getVariantAvailability`.                                           |
| `src/lib/back-in-stock/subscriptions.ts`                         | Subscribe, confirm, unsubscribe, end.                                                                   |
| `src/lib/back-in-stock/deliver.ts`                               | Sending: through the emails plugin, the built-in template, or demo.                                     |
| `src/lib/back-in-stock/emails-template.ts`                       | `backInStockEmailTemplate` for the emails plugin (exported as `/emails`).                               |
| `src/lib/back-in-stock/render.ts`, `copy/`                       | Built-in email template and link pages; default text in English and Polish.                             |
| `src/lib/back-in-stock/options.ts`, `settings.ts`                | Plugin options, and the settings admins change, merged over them.                                       |
| `src/lib/back-in-stock/api/`                                     | Route helpers, validators, link pages, rate limiting and the middleware routes.                         |
| `src/lib/back-in-stock/kit/`, `src/admin/lib/back-in-stock/kit/` | **Generated** copies of the repo's `kit/`.                                                              |
| `src/modules/back-in-stock/`                                     | Subscriptions, tokens, sent history, variant state, pending checks, settings. Implements `EngineStore`. |
| `src/subscribers/back-in-stock-*`                                | Stock events → checks; the delayed check; purchases ending subscriptions.                               |
| `src/jobs/back-in-stock-cleanup.ts`                              | Daily retention and recovery of stuck checks. It detects nothing.                                       |
| `src/workflows/back-in-stock/`                                   | Exported workflows.                                                                                     |
| `src/api/{store,hooks,admin}/back-in-stock/`                     | Routes. `src/api/middlewares.ts` only spreads `backInStockMiddlewares`.                                 |
| `src/admin/`                                                     | The Extensions page, product widget and translations.                                                   |
| `storefront/`                                                    | Copy-in storefront kit (not in the npm package).                                                        |

## Conventions

- **Events only.** No job looks for restocks. If you add a way stock can
  change, make it go through an event the stock subscriber handles, or call
  `scheduleChecks`.
- **The pending check is the record, the event is the timer.** Write the
  row before emitting, delete it only at the end of `runCheck`, and keep
  `claimCheck` a single conditional UPDATE.
- **One email in flight per subscription** is enforced by a partial unique
  index on `back_in_stock_notification`. Create the row before sending.
- **No GET acts.** Link pages render a form; only POST changes anything.
- **Tokens are hashed.** Only `issueToken` sees a token in clear, and only
  to put it in an email.
- **The emails plugin is never imported.** It is found through the
  container (`emails`) and the workflow registry (`send-emails-message`).
- **Polish text** lives in `src/lib/back-in-stock/copy/pl.ts`, the admin
  translations and the storefront component's labels.

## Releasing

Update `version` in `package.json` and `CHANGELOG.md`, merge to `main`, then
push a tag `medusa-plugin-back-in-stock@<version>`.
