# Coupons for Medusa v2

`@bitshaft/medusa-plugin-coupons` · [Polska wersja](./docs/README.pl.md)

A coupon panel for store owners, built on Medusa's Promotion Module. Every
coupon is described in one full sentence, created in a three-step wizard with
a live preview, and can carry rules the Promotion Module does not have:
limits per customer, first order only, coupons that do not combine,
exclusions, tiers and batches of single-use codes.

**Medusa always computes the discount.** The plugin creates ordinary Medusa
promotions and campaigns, and expresses its own rules as promotion rules on a
few extra context attributes. Discounts land on carts and orders as standard
adjustments, so other plugins (an Omnibus price history, say) read them the
usual way.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [What core does and what the plugin adds](#what-core-does-and-what-the-plugin-adds)
- [Admin](#admin)
- [Store API](#store-api)
- [Workflows, hooks and events](#workflows-hooks-and-events)
- [What it does not do](#what-it-does-not-do)
- [Testing](#testing)
- [License](#license)

## Requirements

- Medusa `^2.22.0` (tested with 2.22.3)
- Node.js `^20.19.0 || >=22.12.0`

## Installation

```bash
npm install @bitshaft/medusa-plugin-coupons
```

```ts
// medusa-config.ts
module.exports = defineConfig({
  // …
  plugins: [
    {
      resolve: "@bitshaft/medusa-plugin-coupons",
      options: {
        // every option is optional; these are the defaults
        timeZone: "Europe/Warsaw",
        defaultLocale: "pl",
      },
    },
  ],
})
```

```bash
npx medusa db:migrate
```

The page appears in the admin under **Extensions → Coupons**.

## Configuration

No option is required. Invalid options never stop Medusa: the plugin stays
disabled, logs one line (`[coupons] Disabled: …`) and the admin page shows why.

| Option                    | Default         | Meaning                                                                               |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `timeZone`                | `Europe/Warsaw` | Dates in sentences and exports, and "ends within 7 days", use this time zone.         |
| `defaultLocale`           | `pl`            | Language of customer messages when the request names none (`pl` or `en`).             |
| `maxBatchSize`            | `5000`          | Most codes one batch may create (up to 20 000).                                       |
| `checkRateLimitPerMinute` | `20`            | Requests per minute one visitor may make to `/store/coupons/check`, against guessing. |
| `settings.currencyCode`   | `pln`           | Currency of new fixed-amount coupons and minimum baskets.                             |
| `settings.codeLength`     | `10`            | Length of random batch codes, without the prefix.                                     |
| `settings.exportLocale`   | `pl`            | Language of the CSV exports.                                                          |

The `settings` values can also be changed on the Settings tab; only changed
values are stored, the rest follow the options.

### Environment variables

| Variable                | Meaning                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `COUPONS_DISABLE_HOOKS` | `cart-promotions`, `complete-cart` or both (comma separated). See [hooks](#workflows-hooks-and-events). |

## What core does and what the plugin adds

| Feature                                                       | Done by               | How                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Percentage, amount, free shipping                             | Core                  | A standard promotion: `items` with `across` allocation (how core computes an `order` target, but allowing target rules), or `shipping_methods`.                                                                                                         |
| Category discount                                             | Core                  | Target rule on the item's categories.                                                                                                                                                                                                                   |
| Buy X, get Y                                                  | Core                  | A `buyget` promotion with buy rules, `buy_rules_min_quantity` and `apply_to_quantity`.                                                                                                                                                                  |
| Dates (scheduled, ended)                                      | Core                  | The promotion's campaign `starts_at` / `ends_at`; core only applies promotions inside them.                                                                                                                                                             |
| Total usage limit                                             | Core                  | `promotion.limit`, counted by core when an order is placed, with row locks against races. Tiered coupons share a campaign `usage` budget.                                                                                                               |
| Pause / resume                                                | Core                  | Promotion status `inactive` / `active`.                                                                                                                                                                                                                 |
| Minimum basket (gross, before discounts)                      | Core                  | Promotion rule `original_item_total >= min`. Not `item_total`, which is after discounts and would switch the coupon off once applied.                                                                                                                   |
| Who: groups, chosen customers                                 | Plugin context + core | The plugin's `setPromotionContext` hook adds `coupons_customer.{id,group_ids}`; the coupon has an `in` rule on it.                                                                                                                                      |
| First order only                                              | Plugin context + core | The hook adds `coupons_customer.first_order` (no earlier order by customer id, or by e-mail for guests; cancelled and draft orders excluded).                                                                                                           |
| Exclusions (products, collections, categories, items on sale) | Plugin context + core | The hook gives every item `coupons_keys` (`p:…`, `c:…`, `k:…`, `sale` when `compare_at_unit_price` is above the price, and `*` so the attribute always exists); the coupon has one `ne` target rule.                                                    |
| Does not combine                                              | Plugin                | Adding a code next to a non-combining coupon (or vice versa) is refused with a reason. The plugin's automatic coupons step aside through rules: non-combining automatic ones when any code is entered, the others when a non-combining code is entered. |
| Tiers                                                         | Plugin + core         | One automatic promotion per level, limited to its basket band (`>= min`, `< next min`), so exactly the highest level applies. With a code, the levels open only when that code is on the cart (kept in `cart.metadata.coupons_codes`).                  |
| Limit per customer                                            | Plugin                | Counts earlier orders with the coupon by customer id, or by e-mail for guests. Checked when the code is added and again before the order is placed.                                                                                                     |
| Batches of single-use codes                                   | Core + plugin         | One promotion per code with `limit: 1`, on one campaign; the plugin generates unique codes, lists which were used in which order and exports CSV.                                                                                                       |
| One-sentence description                                      | Plugin                | Generated from the settings in Polish and English, for the list, the wizard and the export.                                                                                                                                                             |
| Stats and CSV export                                          | Plugin                | Orders found through Medusa's `order_promotion` link; discount from the adjustments.                                                                                                                                                                    |

The plugin keeps its own data (the wizard settings, admin settings) in a
`coupons` module, linked to the promotions with a module link
(`coupons_coupon` ↔ `promotion`).

## Admin

**Panel**: cards (all, active, scheduled, orders with a coupon in the last 30
days with the discount, ending within 7 days, automatic), filters with
counters, search by code, and the list with each coupon's sentence, uses,
discount, orders and revenue. Row actions: edit, pause/resume, duplicate (a
paused copy), open in Medusa promotions, delete. Clicking a row shows the
orders that used it, or for a batch its codes.

**Wizard**: kind → who for → rules, with a panel on the right: what the
customer sees, the sentence, a summary, readiness of each step, and warnings
before saving (overlap with an active automatic coupon, code taken, end
before start, 100% or a discount at or above the minimum basket, automatic
coupon with no conditions). Editing keeps usage counts; the code, the kind,
automatic or not and the number of tiers cannot change (duplicate instead).

**Guide** explains the rules in plain words. **Settings** shows the options
and lets the owner change the currency, code length and export language.

The admin is in English and Polish and follows the admin language.

## Store API

The plugin ships no storefront components. Codes are added and removed with
Medusa's own endpoints; the plugin checks them on the way.

### Add or remove a code

```http
POST   /store/carts/{id}/promotions   { "promo_codes": ["JESIEN15"] }
DELETE /store/carts/{id}/promotions   { "promo_codes": ["JESIEN15"] }
```

When the plugin refuses a code the response is a `400` whose `message` holds
the reason in Polish and English, e.g.
`Ten kupon jest tylko na pierwsze zamówienie. / This coupon is only for your first order.`
To remove a tiered coupon, send the code the customer typed.

### Check a code before adding it

```http
POST /store/coupons/check
{ "cart_id": "cart_01…", "code": "JESIEN15", "locale": "pl" }
```

```jsonc
// accepted
{ "valid": true, "code": "JESIEN15", "automatic": false,
  "description": "15% rabatu na całe zamówienie, z kodem JESIEN15, …" }
// refused
{ "valid": false, "code": "JESIEN15", "reason": "min_subtotal",
  "message": "Ten kupon wymaga koszyka od 300,00 zł brutto.",
  "messages": { "pl": "…", "en": "This coupon needs a basket of at least PLN 300.00 gross." },
  "min_subtotal": 300 }
// a promotion created outside this plugin: core decides when it is added
{ "valid": null, "code": "SUMMER", "message": "…" }
```

Reasons: `not_found`, `not_started`, `ended`, `paused`, `exhausted`,
`email_required`, `audience`, `first_order`, `per_customer_limit`,
`min_subtotal`, `exclusive_conflict`. The language comes from `locale`, then
the `x-medusa-locale` header, then `Accept-Language`, then `defaultLocale`.
The endpoint is rate limited per visitor (`checkRateLimitPerMinute`).

### Progress to the next tier or free shipping

```http
GET /store/coupons/progress?cart_id=cart_01…
```

```json
{
  "basket_total": 380.5,
  "tiers": [
    {
      "code": "PROGI",
      "kind": "percentage",
      "levels": [
        { "min": 200, "value": 5, "reached": true },
        { "min": 500, "value": 10, "reached": false }
      ],
      "current": { "min": 200, "value": 5 },
      "next": { "min": 500, "value": 10, "remaining": 119.5 }
    }
  ],
  "free_shipping": { "threshold": 300, "remaining": 0, "reached": true, "code": null }
}
```

It covers the tiered coupons entered on the cart and the automatic offers
open to everyone. Coupons limited to groups, chosen customers or first orders
are left out, so nothing private is shown. Amounts are gross items before
discounts, as the rules use.

## Workflows, hooks and events

| Workflow                    | Does                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `create-coupons-coupon`     | Campaign, promotions, coupon row and links; undone on error. |
| `update-coupons-coupon`     | Updates the promotions in place (ids and usage kept).        |
| `set-coupons-coupon-status` | Pauses or resumes every promotion of a coupon.               |
| `delete-coupons-coupon`     | Soft-deletes the promotions and the coupon.                  |

```ts
import { createCouponsCouponWorkflow } from "@bitshaft/medusa-plugin-coupons/workflows"
```

**Event** `bitshaft.coupons.batch_created`, emitted after a batch is created:

```json
{ "batch_id": "coup_01…", "coupon_id": "coup_01…", "prefix": "NL-", "quantity": 500 }
```

A newsletter plugin can then read the codes with
`GET /admin/coupons/{batch_id}/codes` or through the module link. Birthday
and abandoned-cart coupons belong in the emails plugin, which can create
coupons through this plugin's admin API or workflows.

**Hooks.** The plugin registers handlers on `updateCartPromotionsWorkflow`
(`validate`, `setPromotionContext`) and `completeCartWorkflow` (`validate`).
Medusa allows one handler per hook. If your app already handles one of them,
start Medusa with `COUPONS_DISABLE_HOOKS=complete-cart` (or `cart-promotions`)
and call the plugin's handler from yours:

```ts
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { validateCompleteCart } from "@bitshaft/medusa-plugin-coupons/hooks"

completeCartWorkflow.hooks.validate(async (input, context) => {
  await validateCompleteCart(input, context)
  // … your own checks
})
```

Without the `setPromotionContext` hook the plugin's coupons with audience,
first-order, exclusion, tier or automatic-combining rules do not apply at all
(the attributes are missing), so keep it or call `couponsPromotionContext`.

## What it does not do

- No storefront components: use the Store API above.
- No Omnibus (lowest price in 30 days); that is a separate plugin. Discounts
  are standard Medusa adjustments it can read.
- No birthday or abandoned-cart coupons; the emails plugin does those.
- Promotions created in Medusa outside this panel are not changed. A coupon
  that does not combine is refused when such a promotion is already on the
  cart, but such an automatic promotion that appears later is not removed.
- The per-customer limit is checked when the code is added and before the
  order is placed; two orders placed at the same moment by the same customer
  can both pass. The total limit has no such gap (core locks it).
- A per-customer limit needs an e-mail on the cart (guests are counted by
  e-mail); the customer is asked to add it first.
- Groups and chosen customers need a signed-in customer.
- The code, kind, automatic mode and number of tiers cannot be edited.
- Stats come from orders linked to the coupon's promotions; deleted coupons
  are not in the list.

## Testing

```bash
npm run check              # typecheck and unit tests
npm run test:integration   # needs Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD
```

The integration tests create coupons as real Promotion Module records and run
core's `computeActions` with the context the plugin's hook builds: discounts,
minimum basket, exclusions, categories, free shipping, buy X get Y, tiers,
automatic coupons stepping aside, first order, groups and usage limits.

To try it in an app: `npx medusa plugin:publish` here, then
`npx medusa plugin:add @bitshaft/medusa-plugin-coupons` in the app.

## License

MIT © Bitshaft
