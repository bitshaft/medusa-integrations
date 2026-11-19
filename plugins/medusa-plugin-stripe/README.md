# Stripe insights for Medusa v2

`@bitshaft/medusa-plugin-stripe` · [Polska wersja](./docs/README.pl.md)

Stripe data in the Medusa admin, next to the **official** Stripe payment
provider: turnover, fees and net per currency, payment success by method,
payments with their orders (and paid payments that never became an order),
payouts broken down into the orders they pay out, open disputes with
deadlines, and configuration checks that say how to fix what is wrong.

**Read-only, enforced in code.** The plugin's Stripe client has one method
(GET) and an allow-list of paths; anything else throws before a request is
sent. No code path can capture, refund or pay out. Payments and refunds stay
with `@medusajs/medusa/payment-stripe`.

## Install with an AI assistant

Paste this into Claude Code, Cursor or another coding assistant, in your
Medusa backend project:

```text
Install and configure @bitshaft/medusa-plugin-stripe in this Medusa v2 project.

1. Run: npm install @bitshaft/medusa-plugin-stripe
2. In medusa-config.ts add to `plugins`:
   {
     resolve: "@bitshaft/medusa-plugin-stripe",
     options: {
       apiKey: process.env.STRIPE_INSIGHTS_API_KEY,
       storefrontDomains: [/* the storefront's domains, e.g. "shop.example.com" */],
       mode: process.env.STRIPE_INSIGHTS_MODE as "live" | "test" | undefined,
     },
   }
   Keep the existing @medusajs/medusa/payment-stripe provider unchanged; this
   plugin only reads Stripe. If that provider's `id` is not "stripe", add
   `providerId: "<that id>"` to the options above.
3. Add STRIPE_INSIGHTS_API_KEY= and STRIPE_INSIGHTS_MODE=test to .env.template
   (and .env, empty). Do not invent a key and never commit one.
4. Tell me to create a Stripe *restricted* key with Read on: Balance,
   Balance transactions, Payouts, Disputes, PaymentIntents, Charges,
   Refunds, Events, Webhook Endpoints, Payment Method Domains, Payment
   Method Configurations, Account; and None on everything else.
5. Run the type check and build the project. Do not run migrations for this
   plugin: it has none.
Then tell me to open Admin → Stripe → Settings (the checks are there).
```

## Installation

1. Install:

   ```bash
   npm install @bitshaft/medusa-plugin-stripe
   ```

2. Add it to `medusa-config.ts` (keep the official provider as it is):

   ```ts
   module.exports = defineConfig({
     plugins: [
       {
         resolve: "@bitshaft/medusa-plugin-stripe",
         options: {
           apiKey: process.env.STRIPE_INSIGHTS_API_KEY,
           storefrontDomains: ["shop.example.com"],
         },
       },
     ],
   })
   ```

3. Create a restricted key (below), put it in `STRIPE_INSIGHTS_API_KEY`,
   restart Medusa and open **Stripe → Settings** in the admin: the
   checks are at the top.

No migrations: the plugin stores nothing.

## Options

| Option               | Default  |                                                                                                                         |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apiKey`             | —        | Stripe key, preferably restricted (`rk_live_…`). Required unless `demo`. Use an environment variable                    |
| `demo`               | `false`  | Sample data on every tab and **no request to Stripe at all**                                                            |
| `providerId`         | `stripe` | The `id` of the official provider in medusa-config (registered as `pp_stripe_<id>`)                                     |
| `backendUrl`         | —        | Public backend URL for the webhook check; defaults to `admin.backendUrl` or `MEDUSA_BACKEND_URL`                        |
| `storefrontDomains`  | `[]`     | Domains checked for Apple Pay and Google Pay                                                                            |
| `cacheSeconds`       | `300`    | How long Stripe answers are reused                                                                                      |
| `mode`               | —        | Expected key mode, `live` or `test`. Without it: live when `NODE_ENV=production`, else test (staging: set it to test)   |
| `orphanGraceMinutes` | `30`     | A paid payment without an order is flagged only after this many minutes (raise it for delayed methods or slow webhooks) |

Without a key (and without `demo`) the plugin stays disabled and logs one
line (`[stripe] Disabled: missing option apiKey`); Medusa starts normally and
the admin page shows Settings (with the checks) and the Guide. A wrong key is a failed check,
not an error.

## Key permissions

Use a **restricted key**, not the full secret key. The checks on the Settings tab warn when
an `sk_` key is used. Set **Read** on:

| Stripe resource               | Used for                                    |
| ----------------------------- | ------------------------------------------- |
| Balance                       | balance, key check                          |
| Balance transactions          | turnover, fees, net, payout contents        |
| Payouts                       | payouts, next payout                        |
| Disputes                      | disputes                                    |
| PaymentIntents                | payments, order widget, capture mode check  |
| Charges (and Refunds)         | method, decline reason, Radar, 3D Secure    |
| Events                        | failed webhook deliveries of the last day   |
| Webhook Endpoints             | webhook check                               |
| Payment Method Domains        | Apple Pay and Google Pay domains check      |
| Payment Method Configurations | payment methods check                       |
| Account                       | account check (charges and payouts enabled) |

Everything else: **None**. A missing permission shows as a warning on the
check that needs it ("no permission"), not as an error.

The key is used only in the `Authorization` header, is masked in logs and
error messages, and is never returned by the admin API: the admin sees only
its kind (`sk`/`rk`), mode (live/test) and last four characters.

## Allowed Stripe paths

The client refuses any method other than GET and any path not listed here
(`{id}` is letters, digits and `_` only):

```
/v1/account
/v1/balance
/v1/balance_transactions          /v1/balance_transactions/{id}
/v1/payouts                       /v1/payouts/{id}
/v1/payment_intents               /v1/payment_intents/{id}
/v1/charges                       /v1/charges/{id}
/v1/refunds
/v1/disputes                      /v1/disputes/{id}
/v1/webhook_endpoints
/v1/events
/v1/payment_method_domains
/v1/payment_method_configurations
```

## How it works

- **On demand only.** Stripe is read when someone opens a tab or presses
  Refresh. Nothing runs in the background.
- **Cache and request sharing.** Answers are reused for `cacheSeconds`.
  While a request is running, other admins asking for the same data wait for
  it: several admins at once cause one request to Stripe. Refresh clears the
  cache.
- **Time budget.** One page has 25 seconds. Parts that did not finish are
  left out and the page says the data is incomplete.
- **List limit.** At most 1000 items per list. When a list is cut, every
  total built from it says so ("sum of the first 1000 items, incomplete"),
  and CSV exports start with a warning row.
- **Money.** Amounts stay integers in the smallest unit (grosze), as Stripe
  sends them. Totals are kept per currency and never added across
  currencies. They are formatted only in the admin (`255,00 zł`).
- **Orders.** The official provider stores the Medusa payment session id in
  the PaymentIntent's metadata (`session_id`); the plugin follows session →
  payment collection → order. As a fallback it matches Medusa payments whose
  data holds the PaymentIntent id. A paid or authorised payment with no
  order, older than `orphanGraceMinutes`, is shown in red.
- **No tables.** The plugin has a module (for options and the cache) but no
  data models and no migrations.

## Admin

**Stripe** in the main menu:

- **Overview** (7 or 30 days): turnover, Stripe fees, net, refunds, payment
  success (successful / all attempts), open disputes, balance (available and
  pending), next payout, and a table by method (cards, BLIK, Przelewy24,
  Apple Pay, Google Pay, other).
- **Payments**: method, status, decline reason, Radar risk, amount, fee,
  net, links to the Medusa order and to Stripe; paid payments without an
  order in red. Filters: period, method, status, currency. CSV export.
- **Payouts**: date and amount; a payout opens the payments, refunds and
  fees in it, with their orders, and items without an order flagged. CSV
  export for accounting.
- **Disputes**: open disputes with amount, reason, evidence deadline, days
  left, urgency (under 3 days), links to the order and to the dispute in
  Stripe (where you respond).
- **Settings**: the checks, OK / warning / error, each with how to fix it:
  provider registered as `pp_stripe_<providerId>`; key present, valid and
  restricted; account active with payments and payouts; payment methods on
  (cards, BLIK, Przelewy24, Apple Pay, Google Pay); the provider's webhook
  points at the backend with no failed deliveries in a day; storefront
  domains registered for Apple Pay and Google Pay; capture mode matches the
  provider's setting; test/live matches the expected mode.
- **Guide**: setup from the restricted key to the first test payment.

An **order widget** shows the PaymentIntent behind the order: status,
method (e.g. `Visa •••• 4242`, `BLIK`), amount, fee, net, exchange rate
(when converted), 3D Secure, Radar risk, refunds, disputes, the payout that
contains the money and a link to Stripe. After a capture or refund in Medusa
the cached answer for that PaymentIntent is dropped and the widget reads
Stripe again.

The admin is in Polish and English and follows the light and dark theme.

## Admin API

All under `/admin/stripe`, for signed-in admin users. Amounts are integers
in minor units; totals are objects keyed by currency. Lists carry
`partial`, `truncated` and `missed` when data is incomplete.

| Route                                                            |                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `GET /status`                                                    | Enabled, demo, key kind/mode/last4, options       |
| `GET /overview?days=7\|30`                                       | Totals, success rate, balance, payouts, by method |
| `GET /payments?days=&status=&method=&currency=&format=json\|csv` | Payments with orders; `orphan` flag               |
| `GET /payouts?days=`                                             | Payouts                                           |
| `GET /payouts/:id?format=json\|csv`                              | Payout contents with orders; `missing_order` flag |
| `GET /disputes`                                                  | Open disputes, nearest deadline first             |
| `GET /checks`                                                    | Configuration checks                              |
| `GET /orders/:id`                                                | Stripe data of an order's payments                |
| `POST /refresh`                                                  | Clears the cache (does not call Stripe)           |

Every `GET` also takes `refresh=true` to skip the cache.

## Limitations

- One Stripe account and one key. Stripe Connect (connected accounts) is not
  supported.
- At most 1000 items per list and 25 seconds per page; longer periods show
  incomplete data, clearly marked.
- Payout contents are listed by Stripe only for automatic payouts.
- The payout of an order is found among the first three automatic payouts
  after the money became available.
- "Payment success" counts charges (attempts); a PaymentIntent with no charge
  attempt is not counted.
- The capture mode check compares the last 20 PaymentIntents with the
  provider's `capture` option; another app on the same Stripe account can
  make it warn.
- Failed webhook deliveries come from Stripe events that were not delivered
  to some endpoint; they are not split per endpoint.
- The cache is per server process.

## Testing

```bash
npm run check
```

Stripe is mocked in the tests: the GET-only client and its allow-list, key
masking, integer totals per currency, mapping payments to orders and
spotting payments without an order, every check (OK, warning, error), the
cache and request sharing, the time budget, startup without a key, and demo
mode making no requests.

## License

MIT © Bitshaft. Stripe is a trademark of Stripe, Inc.
