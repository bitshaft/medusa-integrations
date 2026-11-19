# kit

Shared code for the plugins in this repo. It is **not** an npm package.
`npm run kit:sync` copies it into every plugin, so each published package is
self-contained and has no extra runtime dependency.

| Source        | Copied to (in each plugin)       | Contents                                                                                                                                                                                 |
| ------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kit/server/` | `src/lib/<namespace>/kit/`       | HTTP client (timeouts, safe retries, secret masking), option helpers (disabled mode), package version, API helpers                                                                       |
| `kit/admin/`  | `src/admin/lib/<namespace>/kit/` | Admin JS SDK instance, formatting helpers, sidebar icon tile (`navIcon`), page icon and tabs (`ui.tsx`), integrations on Medusa's pages (`integrations.tsx`, `overview.tsx`, `texts.ts`) |
| `kit/build/`  | `scripts/kit/`                   | Build helpers used by the plugin's npm scripts (`strip-source-maps.mjs`); not published                                                                                                  |

`<namespace>` is the plugin folder name without `medusa-plugin-`, e.g.
`apaczka`.

Rules:

- Edit files here, never the copies. Copies start with a `GENERATED` header
  and are overwritten on the next sync. `npm run check:repo` fails when a
  copy is out of date.
- Only code that at least two integrations would use the same way belongs
  here. Provider-specific logic stays in the plugin.
- `kit/server/http.ts`, `secrets.ts` and `package-info.ts` must not import
  Medusa, so API clients built on them stay framework-free.
- Tests in `__tests__/` are copied too and run as part of each plugin's
  `npm test`.

## Page layout

`page.tsx` holds the parts every integration's page is built from, so they
look and behave the same:

- `PageHeader`: icon or logo, title with one state badge (green On, orange
  Demo mode, red Off), description, extra actions, and Refresh on the right.
- `PageTabs`: the tab row, with actions (e.g. `DemoResetButton`) at its
  right end. Tab order: the plugin's data tabs, then Settings, then Guide.
- `useTabParam(tabs)`: the open tab in the URL (`?tab=`), so reloading or
  coming back returns to it.
- `DisabledNotice`: under the tabs when options are missing: why, and what
  to do.
- `OptionsCard`: always the last card of the Settings tab: the options
  from medusa-config.ts by their config names, read-only, and the plugin
  version. Folded by default (title and version only); a click opens it.
- `GuideSections`: the Guide tab, section by section.
- `Empty`, `LoadingBlock`, `Pager` (Medusa's table pagination, translated):
  empty lists, loading and paging look the same everywhere.
- `format.ts`: `formatDate` (`13 lis 2026`) and `formatDateTime`
  (`13 lis 2026, 14:05`), the one date format of every integration.
- `hooks.ts`: `useDebounced(value)`. Every search box feeds its text through
  it (300 ms) before it goes into a query: one request per word, not per
  letter.

## Installation steps

Every Guide tab starts with the installation steps, each with the status the
plugin detects in the store. The server builds them with `setupStep(id, done,
{ optional, params })` from `kit/server/setup.ts`, where `done` is `true`,
`false`, or `null` when nothing in the store can show it (e.g. a change in
the storefront). It serves them from `GET /admin/<ns>/setup` as `{ steps }`.
The admin shows them with `<SetupStepsFrom path=… text=…/>` (`setup.tsx`),
with texts in `<ns>.setup.<id>.title` and `.body`.

Statuses: Done (green, optional steps too), To do (orange), Optional (grey,
not done yet), Check yourself (blue, `null`). The header counts the required
steps done.

## Demo mode

`demo.tsx` makes demo mode look the same in every integration:

- `DemoBar` above the page header: the shared "Demo mode" title, with the
  plugin's own hint as children.
- `DemoResetButton` at the right end of the page's tab row, for plugins
  whose demo has data to restore: "Restore test data", a confirmation with
  the plugin's `description`, and a toast with what `onReset` returns.

## Integrations on Medusa's pages

`integrations.tsx` and `overview.tsx` put every installed plugin into one
card per Medusa page, the way a suite of integrations should look:

| Page         | Zone                      | Card                                                                                                                                     |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Order        | `order.details.before`    | Integrations: a tab per plugin that applies to the order                                                                                 |
| Customer     | `customer.details.before` | Integrations: a tab per plugin that applies to the customer                                                                              |
| Order list   | `order.list.before`       | Orders to handle: tiles from Medusa's data, plugin tiles and chips                                                                       |
| Product list | `product.list.before`     | Catalog at a glance: stock, drafts, images, sales, plugin chips                                                                          |
| Product      | `product.details.before`  | Product at a glance: status, price, stock, sales, plugin rows/chips; under it Integrations, a tab per plugin that applies to the product |

How it works:

- A plugin registers what it shows at module load of its widget:
  `registerTab(page, tab)` (brand, a state hook, a panel) or
  `registerSignals(scope, provider)` (a hook returning tiles, rows or chips).
  Plugin signals live in `src/admin/lib/<namespace>/signals.tsx`.
- Every plugin has the same widget in each zone and calls
  `claimZone(zone, namespace)`. Only the first claimer renders, so a page
  gets one card whatever plugins are installed.
- The registry is shared through `globalThis` under a versioned key. Add
  fields without breaking older kits; a breaking change needs a new key.
- Zones in `defineWidgetConfig` must be string literals (Medusa reads them
  from the source), not the constants.
- Colour-coding of states: green ok, orange attention, red error, blue info,
  grey nothing (`Level`).
- The overview cards read Medusa's admin API in the browser (latest 50
  orders; up to 500 products and 500 orders of 90 days for stock and sales)
  and say when they read only part.
- Product tabs (`registerTab("product", …)`) need no widget of their own:
  "Product at a glance" renders the Integrations card under itself. Import
  the plugin's `product-tab.tsx` from its `<namespace>-overview-product.tsx`.
- `texts.ts` holds the cards' Polish and English texts: the kit has no
  translation files of its own. Plugin texts stay in each plugin's i18n.
- **Placement (`layout.tsx`).** Since Medusa 2.22 a page's layout composer
  puts `*.before` and `*.after` widgets in the main column after Medusa's own
  sections, so "before" alone ends up at the bottom. Every plugin's widget in
  these zones sets the same `id` in `defineWidgetConfig`
  (`bitshaft-integrations-<page>-<details|list>`, a string literal; the
  admin numbers repeats `#2`, `#3`…), and the card's owner, on a page with
  **no** saved layout, saves Medusa's default layout once with the card
  first. A layout an admin saved ("Customize layout") is never changed, and
  the card can be moved there like any widget.
- **Icons (`icon.ts`).** Medusa's icons clip with `clip-path="url(#a)"` and
  all share the id `a`, so with several on a page one can come out cut. Kit
  tiles (`BrandTile`, `PageIcon`, `TabTrigger`, `navIcon`) carry
  `ICON_TILE_CLASS`, whose one CSS rule switches that clip off.
