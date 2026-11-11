# Developing the whitelist-vat plugin

Repo-wide rules (naming, namespacing, kit, quality rules) are in
[CLAUDE.md](../../../CLAUDE.md) at the repository root. This page covers what
is specific to this plugin.

## Setup

```bash
cd plugins/medusa-plugin-whitelist-vat
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

They apply the shipped migration and fail when it does not match the data
models, so run them after touching `src/modules/whitelist-vat/models/`. No
test talks to a real register: unit tests inject `fetch`, integration tests
switch every register off.

### Trying it in a Medusa app

```bash
npm run dev                                                   # here: rebuilds and publishes locally on change
npx medusa plugin:add @bitshaft/medusa-plugin-whitelist-vat   # in your Medusa app
```

For manual tests against the registers' test environments see the
[README](../README.md#testing).

## Layout

Everything lives under the `whitelist-vat` namespace so the code can be
copied into an app next to other integrations.

| Path                                                             |                                                                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/lib/whitelist-vat/identifiers.ts`                           | Parsing and check digits of NIP, REGON, EU VAT numbers and bank accounts. **No Medusa imports.**                 |
| `src/lib/whitelist-vat/registers/`                               | Clients for the white list (`mf`), VIES and GUS BIR1.1. **No Medusa imports.** They return results, never throw. |
| `src/lib/whitelist-vat/verdict.ts`                               | Merging the registers' answers into one status and one set of company data.                                      |
| `src/lib/whitelist-vat/verify.ts`                                | The verification: local check, cache, daily limit, asking registers, history rows.                               |
| `src/lib/whitelist-vat/records.ts`                               | Finding the tax ID on orders, carts and customers and verifying it; emits the event.                             |
| `src/lib/whitelist-vat/options.ts`                               | Plugin options (zod).                                                                                            |
| `src/lib/whitelist-vat/api/`                                     | Route helpers, validators, the checkout guard and the plugin's middleware routes (`whitelistVatMiddlewares`).    |
| `src/lib/whitelist-vat/kit/`, `src/admin/lib/whitelist-vat/kit/` | **Generated** copies of the repo's `kit/`. Edit `kit/` at the root and run `npm run kit:sync` there.             |
| `src/modules/whitelist-vat/`                                     | `whitelist_vat_subject` (latest verdict per tax ID) and `whitelist_vat_check` (history); holds the clients.      |
| `src/workflows/whitelist-vat/`                                   | `verify-whitelist-vat-tax-id`, `verify-whitelist-vat-order`.                                                     |
| `src/subscribers/whitelist-vat-order-placed.ts`                  | Verifies the buyer's tax ID when an order is placed.                                                             |
| `src/api/{admin,store}/whitelist-vat/`                           | Admin and store routes. `src/api/middlewares.ts` only spreads `whitelistVatMiddlewares`.                         |
| `src/admin/`                                                     | The Extensions page, order and customer widgets, translations (`i18n/whitelist-vat/en.json`, `pl.json`).         |

## Conventions

- **"Unavailable" is not a verdict.** A register client maps every failure
  (network, timeout, HTTP error, limit, malformed answer) to the outcome
  `unavailable`. `decideStatus` ignores unavailable registers, `mergeSources`
  keeps an earlier answer over an outage, and the options schema does not
  accept `unverified` in `checkout.rejectStatuses`. Keep all three when
  changing this code; `verify.spec.ts` has a test for each.
- **Outcomes versus statuses.** An _outcome_ is what one register said
  (`found`, `unavailable`…); a _status_ is the plugin's verdict about the
  number (`unregistered`, `unverified`…). The history stores outcomes, the
  subject stores the status.
- **The white list quota is shared by everything.** Any new code path that
  calls `MfClient` must record a check row with a non-null `duration_ms`, or
  the daily limit guard will not see it. Rows the plugin made up without a
  request (cache hits, the limit itself) have `duration_ms: null`.
- **Lookups are retried, nothing is written.** Every register call is a
  read, so `idempotent: true` is correct for all of them.
- **GUS answers are XML inside XML.** The search result is an
  entity-encoded document inside the SOAP body, and names are encoded once
  more inside it. `gus.ts` parses it with regular expressions on purpose:
  the documents are small and flat, and a parser would be the plugin's only
  runtime dependency.
- **The checkout guard is a middleware,** not a `completeCartWorkflow` hook
  handler: a hook accepts a single handler and registering a second one
  throws at startup.
- **Canonical numbers.** A Polish NIP is stored as 10 digits, an EU VAT
  number with its prefix (`DE123456789`). Always go through `parseTaxId`.
- **Secrets.** The only one is the GUS key: it is registered with the HTTP
  client's `secrets` and shown masked in the admin.
- **Admin strings** go in both `en.json` and `pl.json`, under the
  `whitelist-vat` key.

## Releasing

Update `version` in `package.json` and `CHANGELOG.md`, merge to `main`, then
push a tag `medusa-plugin-whitelist-vat@<version>`. The publish workflow
builds, checks and publishes this package only.
