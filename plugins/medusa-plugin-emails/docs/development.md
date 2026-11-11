# Developing the emails plugin

Repo-wide rules (naming, namespacing, kit, quality rules) are in
[CLAUDE.md](../../../CLAUDE.md) at the repository root. This page covers what
is specific to this plugin.

## Setup

```bash
cd plugins/medusa-plugin-emails
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
models, so run them after touching `src/modules/emails/models/`.

### Trying it in a Medusa app

```bash
npm run dev                                            # here: rebuilds and publishes locally on change
npx medusa plugin:add @bitshaft/medusa-plugin-emails   # in your Medusa app
```

Start with `demo: true` in the plugin options: no provider is needed and
every email lands in the send log.

## Layout

Everything lives under the `emails` namespace so the code can be copied into
an app next to other integrations.

| Path                                               |                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/emails/send.ts`                           | The pipeline: toggle, loader, dedupe, render, attachments, delivery, retries, demo mode.             |
| `src/lib/emails/triggers.ts`                       | Which emails a Medusa event sends, and their dedupe keys.                                            |
| `src/lib/emails/data/`                             | Loaders that turn event IDs into template data; the order view; sample data for previews.            |
| `src/lib/emails/templates/`                        | React Email components: `kit.tsx` (building blocks, exported as `/templates`) and `built-in.tsx`.    |
| `src/lib/emails/copy/`                             | Default text in English and Polish, interpolation, validation of admin edits.                        |
| `src/lib/emails/transports/`                       | Resend client and SMTP transport. **No Medusa imports.**                                             |
| `src/lib/emails/options.ts`, `settings.ts`         | Plugin options (zod) and the settings admins change, merged over them.                               |
| `src/lib/emails/api/`                              | Route helpers, validators and the plugin's middleware routes (`emailsMiddlewares`).                  |
| `src/lib/emails/kit/`, `src/admin/lib/emails/kit/` | **Generated** copies of the repo's `kit/`. Edit `kit/` at the root and run `npm run kit:sync` there. |
| `src/modules/emails/`                              | Send log, settings and low stock alert tables; holds the parsed options.                             |
| `src/providers/emails/{resend,smtp}/`              | Notification providers (`emails-resend`, `emails-smtp`).                                             |
| `src/workflows/emails/`                            | `send-emails-message`, `resend-emails-message`.                                                      |
| `src/subscribers/emails-*`, `src/jobs/emails-*`    | Event subscribers; the retry job and the low stock check.                                            |
| `src/api/admin/emails/`                            | Admin routes. `src/api/middlewares.ts` only spreads `emailsMiddlewares`.                             |
| `src/admin/`                                       | Settings pages, order and customer widgets, translations (`i18n/emails/en.json`, `pl.json`).         |

## Conventions

- **Adding an email type** takes five places: the definition in
  `types.ts` (`BUILT_IN_TYPES`), a loader in `data/loaders.ts`, a template
  in `templates/built-in.tsx`, text in `copy/en.ts` and `copy/pl.ts`, and a
  name in both admin translation files. `sampleData` in `data/sample.ts`
  feeds the preview. The unit tests fail when one of these is missing or
  when the two languages drift apart.
- **Polish text lives in two places:** the admin translations
  (`src/admin/i18n/emails/pl.json`) and the default email text
  (`src/lib/emails/copy/pl.ts`). Everything else is English.
- **No duplicates.** Every automatic email has a dedupe key built from the
  event's resource. Only failures that are certainly "not sent" are retried
  by the job; transports report `outcomeUnknown` otherwise.
- **Secrets.** Types marked `sensitive` never store their input and bypass
  the workflow (workflow executions can be persisted). Provider secrets go
  through the kit HTTP client's `secrets` or `createSecretMasker`. Log lines
  mask email addresses with `maskEmail`.
- **Rendering** uses `renderToStaticMarkup`, not React Email's `render`:
  the output is the same, but `render` imports `react-dom/server`
  dynamically, which Jest cannot do without extra flags.
- **Copy is plain text.** Templates put it into React text nodes, so
  nothing an admin types is interpreted as HTML.
- **Disabled mode.** Code gets options through the module
  (`getOptions()`, `getSettings()`), which throws a clear "plugin is
  disabled" error. Jobs and subscribers check `isEnabled()` first (the
  pipeline does) and return quietly.
- **Admin strings** go in both `en.json` and `pl.json`, under the `emails`
  key.

## Releasing

Update `version` in `package.json` and `CHANGELOG.md`, merge to `main`, then
push a tag `medusa-plugin-emails@<version>`. The publish workflow builds,
checks and publishes this package only.
