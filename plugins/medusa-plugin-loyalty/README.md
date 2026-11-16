# Loyalty program for Medusa v2

`@bitshaft/medusa-plugin-loyalty` · [Polska wersja](./docs/README.pl.md)

Points for orders and actions, rewards for points, customer tiers,
expiry, and the full history of every point. Built for store owners: every
rule of the program is a setting on the admin page, in Polish and English.

**Everything rests on a ledger.** Every change of a balance is a separate,
immutable entry: type, points (+/−), what it relates to (order, reward,
code), description, who did it, and when. The balance is always the sum of
the ledger. Entries are never edited or deleted (a database trigger refuses
it); mistakes are fixed with a correction. Every write has an idempotency
key, so the same event never adds points twice, and every balance change
locks the customer's account row, so two redemptions at once never spend
the same points.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Store API](#store-api)
- [Events](#events)
- [Admin](#admin)
- [Workflows and hooks](#workflows-and-hooks)
- [What it does not do](#what-it-does-not-do)
- [Testing](#testing)
- [License](#license)

## Requirements

- Medusa `^2.22.0` (tested with 2.22.3)
- Node.js `^20.19.0 || >=22.12.0`

## Installation

```bash
npm install @bitshaft/medusa-plugin-loyalty
```

```ts
// medusa-config.ts
module.exports = defineConfig({
  plugins: [
    {
      resolve: "@bitshaft/medusa-plugin-loyalty",
      options: {
        // both optional; these are the defaults
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

The page appears under **Loyalty** in the main menu, and a widget on
every customer page.

## Configuration

### Plugin options (technical only)

| Option          | Default         | Meaning                                                                 |
| --------------- | --------------- | ----------------------------------------------------------------------- |
| `timeZone`      | `Europe/Warsaw` | "Today" for birthdays, and dates in exports.                            |
| `defaultLocale` | `pl`            | Language of customer messages when the request names none (`pl`, `en`). |

Invalid options never stop Medusa: the plugin stays disabled and logs one
line (`[loyalty] Disabled: …`).

### Program settings (admin, Settings tab)

Everything else is set by the store owner and applies from the moment it is
saved:

| Setting                                                                      | Default               |
| ---------------------------------------------------------------------------- | --------------------- |
| Program on/off                                                               | on                    |
| Currency of program amounts (one of the store's currencies)                  | the store's default   |
| Points: X points per Y of the base                                           | 1 point per 1         |
| Base: items after discounts, gross / net                                     | gross                 |
| Sign-up, first order, birthday, newsletter: on/off and points                | off; 50, 100, 100, 50 |
| Birthday: date change allowed every N days; date set at least N days before  | 365, 30               |
| Birthday: at least 330 days between two bonuses (fixed)                      | 330                   |
| Tiers: name, spend threshold, multiplier, one-off bonus; spend window        | none; 12 months       |
| Expiry after N months without an order or redemption; reminder N days before | 12 months, 30 days    |
| Give points back for reward codes that expire unused                         | yes                   |
| Release a gift from an abandoned cart after N days                           | 14                    |
| Excluded customer groups (earn and redeem nothing)                           | none                  |
| Link to the program terms (returned to the storefront, which shows it)       | empty                 |

### Environment variables

| Variable                   | Meaning                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `LOYALTY_NEWSLETTER_EVENT` | Event that means "newsletter sign-up" (default `newsletter.subscribed`).             |
| `LOYALTY_DISABLE_HOOKS`    | `line-item` to skip the plugin's hook on `updateLineItemInCartWorkflow` (see below). |

## How it works

| What              | When                                                                           | How                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earning           | the order is fully paid (`payment.captured`, also checked on `order.placed`)   | items after discounts, gross or net, without shipping and gifts; × rate × tier multiplier; rounded down. Once per order.                                                                                                  |
| First-order bonus | first paid order, when no earlier non-canceled order exists                    | extra points, taken back if the order is canceled                                                                                                                                                                         |
| Returns           | `order.return_received`                                                        | the share of the points of the returned units, by their value at purchase (not by money refunded). Cumulative and idempotent.                                                                                             |
| Cancellation      | `order.canceled`                                                               | everything earned for the order; gifts in it give their points back                                                                                                                                                       |
| Negative balance  | after a return of spent points                                                 | allowed; blocks redemptions; new points pay it off                                                                                                                                                                        |
| Sign-up           | `customer.created` with an account                                             | once                                                                                                                                                                                                                      |
| Newsletter        | `newsletter.subscribed` with `customer_id` or `email`, or by hand in the admin | once                                                                                                                                                                                                                      |
| Birthday          | daily job                                                                      | once a year; date set through the Store API, changes limited                                                                                                                                                              |
| Tiers             | after every paid order and return, and daily                                   | spend in the window (items after discounts, minus returns); a change is recorded and emits `loyalty.tier_changed`; the tier bonus is given once per tier                                                                  |
| Expiry            | daily job                                                                      | the whole positive balance after N months without an order or redemption (or since joining); `loyalty.points_expiring` once, N days before                                                                                |
| Code rewards      | redemption                                                                     | a one-off promotion code (`LOY-XXXXXXXX`) in the Promotion Module: limit 1, a `customer.id` rule so only this customer can use it, end date on its campaign                                                               |
| Gift rewards      | redemption                                                                     | stock checked in the cart's sales channel, then the variant is added to the customer's open cart at 0, marked `metadata.loyalty_redemption_id`. Removing it before the order gives the points back; its quantity stays 1. |
| Unused codes      | daily job                                                                      | closed, promotion switched off, points back if the setting says so                                                                                                                                                        |
| Abandoned gifts   | daily job                                                                      | removed from the cart and refunded after N days                                                                                                                                                                           |

Guests collect nothing. Customers in excluded groups neither earn nor redeem.

## Store API

All under `/store/loyalty`. Endpoints that need a customer accept the usual
customer session or bearer token. Refusals are `400` (or `404`) with a
`code` and a `message` in Polish and English, e.g.
`Masz za mało punktów na tę nagrodę: potrzeba 500, masz 120. / You do not have enough points for this reward: it needs 500, you have 120.`
Every rule is checked on the server.

| Method | Path                                                   | Who      | Returns                                                                                                           |
| ------ | ------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/store/loyalty/me`                                    | customer | balance, tier, spend, next tier with `remaining`, `expires_at`, birthday, terms link, and ready `texts`           |
| GET    | `/store/loyalty/history?offset=&limit=`                | customer | ledger entries, newest first, `count`                                                                             |
| GET    | `/store/loyalty/rewards`                               | anyone   | active rewards; for a customer also `can_redeem`, `blocked_reason`, `points_missing`, `limit_left`                |
| POST   | `/store/loyalty/rewards/:id/redeem`                    | customer | `{ type: "code", code, expires_at, balance }` or `{ type: "gift", cart, balance }` (send `{ cart_id }` for gifts) |
| GET    | `/store/loyalty/estimate?amount=129.99` or `?cart_id=` | anyone   | `points`, `base`, `multiplier`, `message`                                                                         |
| GET    | `/store/loyalty/terms`                                 | anyone   | `terms_url`, `program_enabled`                                                                                    |
| POST   | `/store/loyalty/birthday`                              | customer | sets `{ birthday: "1990-05-17" }` (or `"--05-17"`)                                                                |

A code can go straight into the cart with Medusa's own
`POST /store/carts/:id/promotions { promo_codes: [code] }`.

Refusal codes: `program_disabled`, `not_signed_in`, `excluded`,
`reward_not_found`, `reward_inactive`, `insufficient_points`,
`negative_balance`, `tier_too_low`, `limit_reached`, `cart_required`,
`cart_not_found`, `cart_not_yours`, `cart_completed`, `out_of_stock`,
`birthday_invalid`, `birthday_locked`, `reward_gift_quantity`.

Example `GET /store/loyalty/me`:

```json
{
  "member": true,
  "balance": 1200,
  "tier": { "id": "silver", "name": "Srebro", "threshold": 1000, "multiplier": 1.25 },
  "spend": 1660,
  "next_tier": { "id": "gold", "name": "Złoto", "threshold": 2000, "multiplier": 1.5, "remaining": 340 },
  "expires_at": "2027-11-13T12:00:00.000Z",
  "terms_url": "https://sklep.pl/regulamin-programu",
  "texts": {
    "balance": "Masz 1200 punktów.",
    "tier": "Twój poziom: Srebro.",
    "next_tier": "Do poziomu Złoto brakuje 340,00 zł.",
    "expiry": "Punkty wygasną 13 lis 2027, jeśli do tego czasu nic nie kupisz ani nie wymienisz."
  }
}
```

## Events

`points` is signed: negative means taken from the customer, positive given.

| Event                     | Payload                                                                                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loyalty.points_earned`   | `customer_id`, `points`, `reason` (`order`, `signup`, `newsletter`, `birthday`, `tier_bonus`, `manual`), `balance`, and `order_id` + `entries` for orders, `tier_id` for tier bonuses                                                                                 |
| `loyalty.points_redeemed` | `customer_id`, `points` (negative), `balance`, `redemption_id`, `reward_id`                                                                                                                                                                                           |
| `loyalty.points_reverted` | `customer_id`, `points`, `reason` (`return`, `cancel`, `manual`: taken back; `gift_removed`, `gift_cart_abandoned`, `gift_order_canceled`, `code_expired`: given back), with `order_id`, `redemption_id`, `cart_id` or `code` as they apply, and `balance` when known |
| `loyalty.points_expiring` | `customer_id`, `points`, `expires_at`                                                                                                                                                                                                                                 |
| `loyalty.points_expired`  | `customer_id`, `points`, `balance`, `expired_at`                                                                                                                                                                                                                      |
| `loyalty.tier_changed`    | `customer_id`, `from_tier` `{ id, name }` or null, `to_tier` `{ id, name }` or null, `direction` (`up`/`down`), `spend`                                                                                                                                               |
| `loyalty.reward_redeemed` | `customer_id`, `redemption_id`, `reward_id`, `reward_name`, `kind`, `cost`, and `code` + `expires_at` for codes or `cart_id` for gifts                                                                                                                                |

The plugin sends no e-mails; an e-mail plugin can listen to these.

## Admin

- **Panel**: members, points given and redeemed in 30 days, open points and
  their value (estimated by the cheapest amount reward: what the shop
  owes), customers per tier, most popular rewards, points expiring within
  30 days.
- **Rewards**: add, edit, switch off; delete only rewards nobody redeemed.
- **Customers**: search, balance, tier, last activity; the full ledger with
  filters by type and date, CSV export, manual correction with a required
  reason (recorded with the admin user), newsletter bonus by hand.
- **Settings**: every rule above, with a "What the customer sees" preview.
- **Guide**: the rules in plain words.
- A widget on the customer page shows the same summary and ledger.

Admin endpoints are under `/admin/loyalty` (`settings`, `dashboard`,
`rewards`, `customers`, `customers/:id/entries?format=csv`,
`customers/:id/adjust`, `customers/:id/newsletter`, `preview`).

## Workflows and hooks

- `redeem-loyalty-code` and `redeem-loyalty-gift`
  (`@bitshaft/medusa-plugin-loyalty/workflows`): spend points and create the
  code or add the gift; each step is undone if a later one fails (points come
  back with a correcting entry).
- Module links (read-only): customer → `loyalty_account`, order →
  `loyalty_entries`, promotion → `loyalty_redemption`.
- Hook: `updateLineItemInCartWorkflow.hooks.validate` keeps a gift's
  quantity at 1. Medusa allows one handler per hook; if your app has one,
  set `LOYALTY_DISABLE_HOOKS=line-item` and call `validateGiftQuantity` from
  `@bitshaft/medusa-plugin-loyalty/hooks` in yours. The plugin uses no
  promotion or checkout hooks, so it runs next to
  `@bitshaft/medusa-plugin-coupons`.

## What it does not do

- No storefront components and no e-mails (other plugins use the events).
- Refunds without a return take no points back: points follow returned
  units, by design.
- Order edits, exchanges and claims after payment are not recalculated;
  returns and cancellations are.
- A reward code used in an order that is later canceled is not given back.
- Points are earned when the order is fully captured; partial captures
  wait for the rest.
- "First order" looks at earlier orders of the customer account; orders the
  person placed as a guest before registering do not count.
- Expiry is counted from the last order or redemption, or from joining when
  there was none; actions and corrections do not move it.
- Gift removal is noticed through `cart.updated`; a cart changed without
  that event is caught by the daily abandoned-gift job.
- The point value on the panel is an estimate from the cheapest amount
  reward.

## Testing

```bash
npm run check              # typecheck and unit tests
npm run test:integration   # needs Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD
```

Integration tests run the ledger, earning, returns, cancellation, negative
balance, tiers, expiry, birthdays, gifts and concurrent redemptions against
the real module and Postgres (orders, carts and customers as fixtures), and
reward codes against the real Promotion Module. The full checkout path is to
be checked on a demo store.

To try it in an app: `npx medusa plugin:publish` here, then
`npx medusa plugin:add @bitshaft/medusa-plugin-loyalty` in the app.

## License

MIT © Bitshaft
