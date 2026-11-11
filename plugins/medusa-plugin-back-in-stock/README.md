<h1 align="center">Back in stock for Medusa</h1>

<p align="center">
  "Notify me when available": customers leave their email on a sold-out variant and get one
  when it is in stock again in their sales channel. Polish and English.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitshaft/medusa-plugin-back-in-stock"><img alt="npm" src="https://img.shields.io/npm/v/@bitshaft/medusa-plugin-back-in-stock"></a>
  <a href="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Medusa" src="https://img.shields.io/badge/medusa-%E2%89%A52.22-7c3aed">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#sending">Sending</a> ·
  <a href="#admin">Admin</a> ·
  <a href="./storefront/README.md">Storefront</a>
</p>

---

## Requirements

- Medusa **2.22** or newer, Node.js 20.19+ or 22.12+
- A notification provider for the `email` channel, or
  [`@bitshaft/medusa-plugin-emails`](../medusa-plugin-emails/README.md). Not
  needed in [demo mode](#demo-mode).

## Installation

```bash
npm install @bitshaft/medusa-plugin-back-in-stock
```

The package has no runtime dependencies of its own. It uses the Medusa
packages your app already has (`@medusajs/framework`, `@medusajs/medusa`,
the admin SDK, UI and icons, `@medusajs/js-sdk`, `@tanstack/react-query`
and `react-router-dom`) as peer dependencies.

Register it ([Configuration](#configuration)) and run the migrations:

```bash
npx medusa db:migrate
```

Then add the "notify me" form to your storefront: see the
[storefront kit](./storefront/README.md).

## Configuration

```ts
// medusa-config.ts
plugins: [
  {
    resolve: "@bitshaft/medusa-plugin-back-in-stock",
    options: {
      // Public URL of the backend: the unsubscribe and confirm links in emails point at it.
      backendUrl: process.env.MEDUSA_BACKEND_URL, // https://api.myshop.pl
      storefrontUrl: process.env.STOREFRONT_URL, // https://myshop.pl
      defaultLocale: "pl",
      from: "My Shop <orders@myshop.pl>", // only without the emails plugin
    },
  },
]
```

**Missing options never stop Medusa.** Without `backendUrl` (or both
`urls.confirm` and `urls.unsubscribe`) there is no way to put an
unsubscribe link in the emails, so the plugin stays disabled and logs one
line: `[back-in-stock] Disabled: missing option backendUrl …`. The admin
page shows the same reason.

| Option                     | Default                                            |                                                                                                       |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `backendUrl`               | required\*                                         | Public URL of the Medusa backend, for the confirm and unsubscribe pages.                              |
| `storefrontUrl`            |                                                    | For the "view product" button.                                                                        |
| `urls.product`             | `{storefrontUrl}/{country_code}/products/{handle}` | Product link. Placeholders: `{handle}`, `{variant_id}`, `{product_id}`, `{country_code}`, `{locale}`. |
| `urls.confirm`             |                                                    | A storefront confirm page, e.g. `{storefrontUrl}/back-in-stock/confirm?token={token}`.                |
| `urls.unsubscribe`         |                                                    | A storefront unsubscribe page. \*Both set: `backendUrl` is optional.                                  |
| `from`                     | the provider's own                                 | Sender, when sending without the emails plugin.                                                       |
| `channel`                  | `"email"`                                          | Notification channel, without the emails plugin.                                                      |
| `emails`                   | `"auto"`                                           | `"off"` never sends through the emails plugin.                                                        |
| `defaultLocale`            | `"en"`                                             | `"en"` or `"pl"`, for subscriptions without a language.                                               |
| `demo`                     | `false`                                            | [Demo mode](#demo-mode).                                                                              |
| `store.rateLimitPerMinute` | `10`                                               | Store and link-page requests per visitor a minute.                                                    |
| `settings.*`               | see [Settings](#settings)                          | Starting values; admins can change them.                                                              |

### Settings

Editable in the admin (Extensions → Back in stock → Settings). The plugin
options give the starting values; once an admin saves a value it wins, and
"Restore defaults" goes back to the options.

| Setting                     | Default  | Meaning                                                                                 |
| --------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `minQuantity`               | `1`      | Units that must be available for a variant to count as back in stock.                   |
| `delayMinutes`              | `5`      | Wait after a stock change, then check again before sending.                             |
| `minGapHours`               | `24`     | No second email to the same subscription within this time.                              |
| `maxNotifications`          | `5`      | Emails one subscription may receive in total.                                           |
| `doubleOptIn`               | `false`  | Subscriptions start only after the customer confirms by email.                          |
| `retention.unconfirmedDays` | `7`      | Unconfirmed subscriptions are deleted.                                                  |
| `retention.endedDays`       | `180`    | Ended subscriptions lose their email address and tokens.                                |
| `retention.activeDays`      | `365`    | Active subscriptions expire.                                                            |
| `consentText.en`, `.pl`     | built in | Shown next to the form; the default says emails continue until purchase or unsubscribe. |

### Environment variables

| Variable             |                               |
| -------------------- | ----------------------------- |
| `MEDUSA_BACKEND_URL` | Public URL of the backend.    |
| `STOREFRONT_URL`     | Public URL of the storefront. |

The names are yours to choose; the plugin only reads options. See
[`.env.template`](./.env.template).

## How it works

**Subscribing.** The storefront posts the email and variant to
`POST /store/back-in-stock/subscriptions`. A variant that can be ordered now
(in stock, not stock-managed, or backorderable) is refused with the code
`variant_in_stock`. Subscribing records the variant as out of stock in that
sales channel. With double opt-in, a confirmation email is sent first.

**Availability** is computed with Medusa's own `getVariantAvailability`, the
same calculation the store API uses: only the stock locations linked to the
sales channel count, stocked minus reserved, and inventory kits are divided
by each item's required quantity.

**Detecting a restock** is driven by inventory events only; there is no
polling job.

1. Changes to inventory levels, reservations (an abandoned cart or a
   canceled order frees stock) and variant settings emit events. The plugin
   turns each into "check this variant in this sales channel", only for
   variants someone is waiting for, and stores it as a pending check.
2. After `delayMinutes` the check runs: it recomputes availability and
   compares it with the last known state. Only a change from out of stock
   to in stock sends emails, so a stock correction made within the delay
   sends nothing.
3. Many events for the same variant within the delay become one check.

The pending check is stored before its timer starts, and deleted only after
the check and its emails are done. A server restart re-schedules waiting
checks at startup; a check whose worker stopped mid-way is taken over after
five minutes (at startup or by the daily cleanup job).

**Sending.** On a restock every active subscription is notified at once.
A subscription stays active after an email and is told about every later
restock, with two guardrails: `minGapHours` between emails and
`maxNotifications` in total. It ends when the customer **buys the variant**
(an order placed by the same customer account or email address),
**unsubscribes**, or **expires**.

**Exactly once.** Before an email goes out a history row is created, and a
database constraint allows one email in flight per subscription, so a
retried event or a second server cannot send it twice. A failed email is
not counted and is tried again at the next restock. An email left "in
flight" by a crash is counted as sent by the daily job (one may have gone
out), so nobody gets it twice.

## Sending

### With @bitshaft/medusa-plugin-emails

Spread the exported templates into that plugin's options:

```ts
import { backInStockEmailTemplate } from "@bitshaft/medusa-plugin-back-in-stock/emails"

{ resolve: "@bitshaft/medusa-plugin-emails", options: { from: "…", templates: { ...backInStockEmailTemplate } } }
```

Back-in-stock emails then use its branding and layout, their text is
editable in its admin (Settings → Emails), and every send appears in its
send log. The plugins find each other at runtime; neither depends on the
other. Without the template registered, the built-in template is used.

### Without it

A built-in template in Polish and English (plain HTML and text) is sent
through Medusa's notification module on the `email` channel, so any
provider registered for that channel works. Providers that take rendered
content (`content.subject`, `content.html`) send it as is.

### Unsubscribing

Every email has an unsubscribe link and a `List-Unsubscribe` header (for
providers that pass headers on). Opening a link **never acts by itself**,
because mail scanners open links: `GET /hooks/back-in-stock/unsubscribe/:token`
shows a page with a button, and the action is a POST. Mail clients' own
one-click unsubscribe (RFC 8058) posts to the same URL. With
`urls.unsubscribe` set, the link opens your storefront page instead, which
calls `POST /store/back-in-stock/unsubscribe` from a button. Confirm links
work the same way.

Tokens are random and stored only as SHA-256 hashes. Every email gets its
own unsubscribe token, and old links keep working while the subscription is
open.

## Privacy

- The email address is used only for these notifications, never added to
  marketing lists. The consent text shown at subscription is stored with it.
- Every email has an unsubscribe link.
- Unconfirmed subscriptions are deleted after 7 days. Ended ones keep no
  email, customer or tokens after 180 days; the row stays (variant, sales
  channel, status, dates, number of emails) so statistics remain correct.
  Active subscriptions expire after 365 days. All configurable.
- Addresses in log lines are masked (`a***@example.com`).

## Admin

**Extensions → Back in stock**

- **Most wanted:** variants ranked by people waiting, per sales channel,
  with current stock. Stock-managed variants without an inventory item are
  flagged: they can never come back until that is fixed.
- **Subscriptions:** filter by status, search by email, see how many emails
  each received and when the last one went out, unsubscribe someone.
- **Sent history:** every email with its result and how it was sent.
- **Settings:** the settings above, a guarded "Restore defaults", how
  emails are sent, the links in use, and the demo tools.

**Product page:** a panel with the people waiting for each variant.

The admin is in English and Polish.

### Demo mode

`demo: true` renders every email and writes it to the log and the sent
history, but sends nothing. Independently of that, the demo tools create
sample subscriptions from your own catalog (out-of-stock variants, the
addresses you choose) marked as demo: their emails are never sent. "Simulate
restock" on the Most wanted tab (Demo filter) runs the whole pipeline for a
variant without touching inventory. "Delete demo data" removes them.

## Store API

| Route                                                     | Auth            |                                                                                               |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `POST /store/back-in-stock/subscriptions`                 | publishable key | Subscribe: `{ email, variant_id, consent: true, sales_channel_id?, locale?, country_code? }`. |
| `GET /store/back-in-stock/subscriptions`                  | customer        | The customer's open subscriptions.                                                            |
| `POST /store/back-in-stock/subscriptions/:id/unsubscribe` | customer        | End one of them.                                                                              |
| `GET /store/back-in-stock/consent?locale=pl`              | publishable key | Consent text and whether double opt-in is on.                                                 |
| `POST /store/back-in-stock/confirm`                       | publishable key | `{ token }` from a confirm link.                                                              |
| `POST /store/back-in-stock/unsubscribe`                   | publishable key | `{ token }` from an unsubscribe link.                                                         |

Logged-in customers may leave out `email`; their account email is used.
`sales_channel_id` is required when the publishable key is linked to
several sales channels. Requests are limited per visitor (HTTP 429).

## Workflows and events

```ts
import {
  BackInStockEvents,
  checkBackInStockVariantsWorkflow,
  createBackInStockSubscriptionWorkflow,
  endBackInStockSubscriptionWorkflow,
} from "@bitshaft/medusa-plugin-back-in-stock/workflows"

// Stock changed outside Medusa's inventory module (e.g. a direct database sync)? Ask for a check:
await checkBackInStockVariantsWorkflow(container).run({
  input: { pairs: [{ variant_id, sales_channel_id }] },
})
```

| Event                                   | Data                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `back-in-stock.subscription.subscribed` | `{ id, variant_id, sales_channel_id, customer_id, status }`                                    |
| `back-in-stock.variant.restocked`       | `{ variant_id, sales_channel_id, available, waiting }`                                         |
| `back-in-stock.subscription.notified`   | `{ id, subscription_id, variant_id, sales_channel_id, customer_id, notification_count, demo }` |

## What it does not do

- No SMS or push notifications, email only.
- No product-level subscriptions: customers choose a variant.
- No conversion tracking (orders placed after an email).
- No batching: everyone waiting is told at once.
- No detection of stock written outside Medusa's inventory module (direct
  database changes emit no events); call `checkBackInStockVariantsWorkflow`
  after such a sync.
- No recheck when a sales channel's stock locations change.

## Testing

1. Turn on `demo: true`, open Extensions → Back in stock → Settings, create
   sample subscriptions, and use "Simulate restock". The emails appear in
   the log and the sent history.
2. With a real provider: subscribe from the storefront to a sold-out
   variant with your own address, raise its stock in the admin, wait
   `delayMinutes`, and check your inbox. Set `delayMinutes` to 0 in the
   settings to skip the wait.

## Troubleshooting

- **`[back-in-stock] Disabled: …` at startup:** set `backendUrl`.
- **Nothing is sent after a restock:** the variant must have been out of
  stock (subscribing records that), the change must go through Medusa's
  inventory module, and the subscription must be active (confirmed) and
  within the guardrails. The sent history shows failed emails with the
  reason.
- **"No inventory item" in Most wanted:** the variant manages inventory but
  has no inventory item linked, so it can never be in stock.
- **Emails fail with "Could not find a notification provider":** register
  a provider for the `email` channel, or install the emails plugin.

## Development

See [docs/development.md](./docs/development.md) and the repository's
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 [Bitshaft](https://bitshaft.pl).
