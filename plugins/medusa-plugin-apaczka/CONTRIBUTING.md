# Contributing

Thanks for helping. This guide covers the setup and the conventions the code
follows.

## Setup

```bash
npm ci
npm test              # unit tests
npm run typecheck
npm run lint
npm run format
```

Integration tests need Postgres (`DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`):

```bash
npm run test:integration
```

Sandbox smoke tests need Apaczka sandbox credentials:

```bash
APACZKA_SANDBOX_APP_ID=... APACZKA_SANDBOX_APP_SECRET=... npm run test:sandbox
```

### Trying it in a Medusa app

```bash
npm run dev                          # in this repo: watches and publishes to the local yalc store
npx medusa plugin:add @bitshaft/medusa-plugin-apaczka   # in your Medusa app
```

## Layout

| Path                            |                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/lib/apaczka/`              | Apaczka API client. **No Medusa imports.** Signing, errors, types, statuses.                                     |
| `src/lib/`                      | Medusa-aware logic without container access: options, order builder, parcels, pricing, addresses, catalog cache. |
| `src/providers/apaczka/`        | The fulfillment provider (rates, checkout validation, labels, cancel).                                           |
| `src/modules/apaczka/`          | Shipment and tracking-event tables, and the client used by routes and jobs.                                      |
| `src/workflows/`                | Create shipment, sync tracking, book pickup, mirror fulfillment state.                                           |
| `src/api/`                      | Webhook, store and admin routes.                                                                                 |
| `src/subscribers/`, `src/jobs/` | Fulfillment and return events, polling and catalog refresh.                                                      |
| `src/admin/`                    | Order widget, settings page, translations (`en.json`, `pl.json`).                                                |
| `storefront/`                   | Copy-in storefront kit (not published in the npm package).                                                       |

## Conventions

- **Field names match the Apaczka wire format.** The API silently drops
  unknown keys, so a renamed field loses data instead of failing. Check the
  [API docs](https://api-docs.apaczka.pl) when adding fields.
- **Money:** grosze (integers) toward Apaczka, major units toward Medusa.
  Convert only with `src/lib/money.ts`.
- **Never retry writes.** Use `idempotent: false` for anything that creates
  or changes state at Apaczka.
- **Workflow steps compensate.** Each step that changes something undoes it
  in its compensation function.
- **Errors explain the fix.** Messages say what is wrong and how to fix it
  ("set `cod.bankAccount`…").
- **Admin strings** go in both `en.json` and `pl.json`.
- Add a changeset (`npx changeset`) for user-visible changes.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`,
`fix:`, `docs:`…). Keep PRs focused, and include tests for behaviour changes.
