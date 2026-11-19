# Price negotiations for Medusa v2

`@bitshaft/medusa-plugin-negotiations` · [Polska wersja](./docs/README.pl.md)

B2B price negotiations. A signed-in customer asks for a price for a product,
a variant or the whole cart. The team answers in one thread: a reply, a
counter-offer with its own deadline, an acceptance, a rejection with a
reason, or an internal note. An agreed price can become a Medusa draft
order, or go into the customer's cart at that price, exactly once.

The admin is in Polish (default) and English and follows the light and dark
theme.

## Install with an AI assistant

Paste this into Claude Code, Cursor or another coding assistant, in your
Medusa backend project:

```text
Install and configure @bitshaft/medusa-plugin-negotiations in this Medusa v2 project.

1. Run: npm install @bitshaft/medusa-plugin-negotiations
2. In medusa-config.ts add to `plugins`:
   {
     resolve: "@bitshaft/medusa-plugin-negotiations",
     options: {
       expiryDays: 14,
       allowedCustomerGroups: [/* B2B customer group ids or names; empty = every signed-in customer */],
       writers: { draftOrders: false, cart: false },
     },
   }
3. Run: npx medusa db:migrate
4. In the storefront, for signed-in customers, add "Ask for a price" on the product page
   (POST /store/negotiations with kind "product", variant_id, quantity, target_unit_price in minor units)
   and on the cart page (kind "cart", cart_id, target_total), plus an account page listing
   GET /store/negotiations with a thread view (messages, accept, withdraw, add to cart).
   Prices are integers in the smallest currency unit (grosze). Send the version you showed with every move;
   on 409 show the returned negotiation instead.
5. Subscribe to negotiation.* events for e-mails; use only the payload's "customer" field in customer e-mails.
Then tell me to open Admin → Negotiations → Rollout guide.
```

## Installation

1. Install:

   ```bash
   npm install @bitshaft/medusa-plugin-negotiations
   ```

2. Add it to `medusa-config.ts`:

   ```ts
   module.exports = defineConfig({
     plugins: [
       {
         resolve: "@bitshaft/medusa-plugin-negotiations",
         options: {
           allowedCustomerGroups: ["B2B"],
         },
       },
     ],
   })
   ```

3. Run the migrations and restart Medusa:

   ```bash
   npx medusa db:migrate
   ```

Then open **Negotiations → Rollout guide** in the admin: every step from
here to production, with its status detected from your store.

## Options

Every option has a default; nothing stops Medusa from starting. Invalid
values keep the plugin disabled and log one line (`[negotiations] Disabled:
…`).

| Option                   | Default             |                                                                                                     |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------- |
| `expiryDays`             | `14`                | A thread with no move for this many days expires. `0` = never. Internal notes do not count as moves |
| `acceptedOfferDays`      | `expiryDays` (`14`) | Days the customer has to use an agreed price (14 when `expiryDays` is 0). Shown to the customer     |
| `defaultCurrency`        | store default       | Currency of product threads when the customer sends neither a region nor a currency                 |
| `customerAccept`         | `true`              | Customers may accept a counter-offer themselves. Off: the team closes the deal at its offer         |
| `allowedCustomerGroups`  | `[]`                | Customer group ids or names allowed to negotiate. Empty: every signed-in customer                   |
| `writers.draftOrders`    | `false`             | Allows draft orders from agreed prices. Also needs arming in the admin settings                     |
| `writers.cart`           | `false`             | Allows agreed lines in the customer's cart. Also needs arming in the admin settings                 |
| `limits.openThreads`     | `10`                | Open threads (open or with a counter-offer) per customer                                            |
| `limits.threadsPerHour`  | `5`                 | New threads per customer per hour                                                                   |
| `limits.messagesPerHour` | `30`                | Customer messages per hour, across their threads                                                    |
| `limits.messageLength`   | `2000`              | Characters per message                                                                              |
| `limits.maxQuantity`     | `10000`             | Quantity of one line                                                                                |
| `demo`                   | `false`             | Sample threads on the admin page (see [Demo mode](#demo-mode)); they never expire and never write   |

Admin settings (Negotiations → Settings, stored in the database): which
counter-offer modes the team may use on whole carts (one amount, a price
per line, or both; changing it does not touch offers already sent), the
maximum discount without a confirmation, and arming each writer.

## How it works

- **Threads.** A number (`NEG-2026-0001`), the customer, product/variant or
  whole cart, the lines with quantities and catalog prices frozen when the
  thread was sent, currency, the customer's target, the team's current offer
  and its deadline, status, whose move it is, the lead, the last activity.
- **Statuses.** `open`, `countered`, `accepted`, `rejected`, `expired`,
  `withdrawn`, with an explicit list of allowed moves
  (`src/lib/negotiations/state.ts`). Messages are append-only (the database
  refuses updates and deletes).
- **Every move is one conditional update** on the thread's status and
  version. Two people, or a person and the expiry job, cannot close a
  thread twice: the second update matches no row and gets `409` with the
  current thread.
- **Acceptance carries the price the person saw.** If the price changed in
  the meantime, nothing is accepted and the answer is `409 price_changed`
  with the current offer.
- **Money** is integers in the smallest unit (grosze) with the currency code.
  Medusa's decimal prices are converted only at the border, on decimal
  strings, never with floating point.
- **Whole cart.** The customer sends one target for the cart. The team
  answers with one amount or a price per line. One amount is spread over the
  lines in proportion to their catalog value, in whole grosze per unit; the
  admin shows the amount that will actually be sent (for example
  `2124,98 zł` for a typed `2125,00 zł`). The difference is always in the
  customer's favour.
- **Catalog price** is computed like the Store API does (region, currency,
  the customer's groups, so price lists apply) when the thread is sent, and
  frozen. For a whole cart it is the cart's unit prices at that moment.
- **Net or gross** follows the catalog, not an option: a thread takes it
  from the catalog price it starts from, as Medusa calculated it. Medusa
  sets it with "Tax inclusive pricing" per currency (Settings → Store →
  Currencies), and per region (Settings → Regions) for prices set only for
  that region. A shop with gross prices negotiates gross,
  one with net prices negotiates net, and switching the catalog switches new
  threads with it. A thread keeps its basis to the end, and the cart and
  draft order lines are written with it, so an agreed 108 zł gross is 108 zł
  at checkout. A cart whose lines mix net and gross is refused. The admin
  shows the basis on every thread (a badge, the "Prices" row, the
  counter-offer fields, the accept buttons, the conversation and the draft
  order total), lists it per currency in Settings (plus regions whose own
  setting differs), and next to each minimum price.
- **Minimum price.** A per-currency minimum price on each variant (variant
  widget) and an optional maximum discount. A counter-offer or acceptance
  below them shows the difference and needs a confirmation. Minimum prices
  never leave through the Store API or customer events.
- **Expiry.** An hourly job (and "Expire inactive now"): a counter-offer past
  its deadline lapses (the thread goes back to `open`, the team's move, with
  a system message "The counter-offer expired"); a thread with no move for
  `expiryDays` expires. Demo threads never expire.
- **After acceptance** (off by default, each writer needs its option and a
  person arming it):
  1. **Draft order.** Plan (region from the customer's default address
     country and the thread's currency, else the first region with that
     currency; the default address or e-mail only; the store's default sales
     channel; all changeable), dry run, then the write. Exactly once per
     thread, recorded in the history.
  2. **Cart.** The customer adds the agreed lines to their cart at the agreed
     unit prices, tagged with the thread in their metadata. Again only after
     the lines were removed, while the offer is valid and before an order was
     placed from it. Their quantity and metadata are locked, and checkout checks that the
     lines still match the agreed offer. A draft order and the cart exclude
     each other.
- **Links.** Read-only module links from a thread to its customer
  (`customer_account`), product, variant, source cart and order.

## Events

`negotiation.created`, `negotiation.message_added`,
`negotiation.counter_offered`, `negotiation.accepted`,
`negotiation.rejected`, `negotiation.expired`, `negotiation.withdrawn`,
`negotiation.draft_order_created`, `negotiation.added_to_cart`.

Every payload has the same shape:

```jsonc
{
  "id": "negt_…",
  "number": "NEG-2026-0001",
  "kind": "product", // or "cart"
  "status": "countered",
  "turn": "customer", // whose move: "team", "customer" or null
  "customer_id": "cus_…",
  "currency_code": "pln",
  "is_demo": false,
  "actor": { "type": "user", "id": "user_…" }, // "customer", "user" or "system"
  "audience": "customer", // "team" for internal notes
  "message_id": "negm_…",
  // Safe to show the customer: the same fields as the Store API, plus the message.
  // null for team events (internal notes).
  "customer": {
    "thread": { "number": "…", "lines": [], "offer": {}, "expires_at": "…" },
    "message": { "type": "counter_offer", "body": "…", "price": {} },
  },
  // Bookkeeping for CRM or ERP. Never put it in a customer e-mail.
  "team": {
    "assignee_id": "user_…",
    "catalog_total": 1716000,
    "target_total": 1440000,
    "offer_total": 1560000,
    "accepted_total": null,
    "customer": { "email": "…", "company_name": "…" },
    "note": null, // the text of an internal note
  },
}
```

`negotiation.draft_order_created` adds `draft_order_id`, and
`negotiation.added_to_cart` adds `cart_id`, to both parts. Amounts are
integers in minor units.

## Store API

Signed-in customers only (session or bearer token). Amounts are integers in
minor units. Refusals answer with a `code`, the `message` in the customer's
language (`x-medusa-locale`, then `Accept-Language`, Polish by default) and
both texts in `messages: { pl, en }`. Conflicts (`409`) also return the
current `negotiation`.

| Route                                            | Body                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /store/negotiations`                       | `{ kind: "product", variant_id \| product_id, quantity, target_unit_price, region_id?, currency_code?, message? }` or `{ kind: "cart", cart_id, target_total, message? }` |
| `GET /store/negotiations?status=&limit=&offset=` | The customer's threads                                                                                                                                                    |
| `GET /store/negotiations/:id`                    | One thread with its messages, without internal notes                                                                                                                      |
| `POST /store/negotiations/:id/messages`          | `{ version, message?, target_price? }` (per unit on a product thread, for the cart on a cart thread)                                                                      |
| `POST /store/negotiations/:id/accept`            | `{ version, price }`: the offer total the customer saw. Needs `customerAccept`                                                                                            |
| `POST /store/negotiations/:id/withdraw`          | `{ version, message? }`                                                                                                                                                   |
| `POST /store/negotiations/:id/add-to-cart`       | `{ cart_id }`: the agreed lines at the agreed prices. Needs `writers.cart` and arming                                                                                     |

A thread in the Store API has `can: { reply, accept, withdraw, add_to_cart }`
for the buttons, `offer.expires_at` for the counter-offer's deadline and
`accepted.until` for the agreed price.

The plugin also guards Medusa's own cart routes: `POST
/store/carts/:id/line-items` refuses metadata keys starting with
`negotiation_`, `POST /store/carts/:id/line-items/:line_id` refuses a new
quantity or any metadata change for a negotiated line (`metadata: null`
would clear its tag), and `POST /store/carts/:id/complete` refuses
negotiated lines that no longer match the agreed offer, and lines the
plugin added that lost their tag.

## Admin API

All under `/admin/negotiations`.

| Route                                                   |                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /?status=&waiting=&q=&customer_id=&product_id=`    | Threads, counts per status, the oldest one waiting for the team                     |
| `GET /stats`                                            | Dashboard counters (amounts per currency)                                           |
| `GET /:id`                                              | Thread, every message, minimum prices and their check, writes, history              |
| `POST /:id/messages`                                    | `{ type: "message", version, message }` or `{ type: "internal_note", message }`     |
| `POST /:id/preview`                                     | `{ price }`: the offer it would produce and the warnings. Saves nothing             |
| `POST /:id/counter`                                     | `{ version, price, valid_until?, message?, confirm_below_floor? }`                  |
| `POST /:id/accept`                                      | `{ version, basis: "target" \| "offer", price, confirm_below_floor? }`              |
| `POST /:id/reject`                                      | `{ version, reason }`                                                               |
| `POST /:id/assign`                                      | `{ user_id \| null }`                                                               |
| `POST /:id/draft-order/plan`, `/dry-run`                | `{ region_id?, sales_channel_id?, address_id? }` (`address_id: null` = e-mail only) |
| `POST /:id/draft-order/commit`                          | `{ dry_run_id }`: valid for 30 minutes, with the same data                          |
| `POST /expire`                                          | "Expire inactive now"                                                               |
| `POST /demo/reset`                                      | "Restore test data" (demo mode only)                                                |
| `GET /settings`, `POST /settings`                       | Options (read-only) and settings                                                    |
| `GET /runs`                                             | Writer history                                                                      |
| `GET /guide`                                            | Rollout steps with their detected status                                            |
| `GET /variants/:id/floors`, `POST /variants/:id/floors` | A variant's minimum prices `{ floors: [{ currency_code, amount }] }`                |

`price` is `{ mode: "unit", unit_price }`, `{ mode: "total", total }` or
`{ mode: "lines", lines: [{ variant_id, unit_price }] }`.

## Admin

**Negotiations** in the main menu:

- **Dashboard**: waiting for you, open, with a counter-offer, value in talks,
  expiring within two days, accepted, agreed amount, rejected and expired in
  30 days, average first reply. The thread list with status filters and
  counts, search (number, product, SKU, customer), a filter by assignee
  (mine, no assignee, anyone on the team), the assignee column with a "No
  assignee" flag on active threads, a "your move" dot, and "Answer the
  oldest".
- **Thread page**: details (customer, product, SKU, quantity, catalog price,
  target, our offer, value and discount, lead, start, expiry), the
  conversation (customer on the left, team on the right, internal notes
  highlighted), the team's move (reply, counter-offer with unit price or cart
  amount and a deadline, internal note, reject with a reason), Accept
  [price], customer and product cards, and the draft order panel.
- **Rollout guide**: what the plugin does, how it connects, the steps from
  installation to production with their status, and the AI prompt.
- **Settings**: options (read-only), counter-offer modes, maximum discount,
  arming the writers, expiry, demo data, net or gross per region, the writer
  history.

Widgets: a Negotiations tab with the threads in the Integrations cards of
the product and customer pages, and a minimum price on the variant page.

### Demo mode

With `demo: true` the admin shows ten sample negotiations instead of the
real ones, seeded the first time the page opens. They are built from the
store's own published products (one variant each, with its price in the
store's default currency and its thumbnail); a store without products gets
built-in sample products in PLN. Together they show every feature:

- every status: open, with a counter-offer, accepted, rejected, expired and
  withdrawn, spread over the last 30 days for the dashboard;
- product and cart threads, offers per unit, per line and for the whole
  cart, several rounds of offers and targets;
- a counter-offer that lapsed, an offer that expires tomorrow, a cart
  waiting days for a reply (the oldest on the list), an accepted offer added
  to the cart, a price the team accepted straight away;
- internal notes, and threads assigned to the admin who restored them.

**Restore test data** in the demo bar at the top of the page (and in
Settings) replaces every demo thread with a fresh set, after a
confirmation; the admin can try every move on them first. Real threads are
never touched. Demo threads never expire, never create draft orders or carts
and never send anything.

## Limitations

- One currency per thread. Catalog prices are frozen when the thread is sent;
  later catalog changes do not move them.
- Net and gross are never converted into each other (the VAT rate depends
  on the delivery country, the product and reverse charge, which are known
  only at checkout). A minimum price is entered per currency and compared
  with the thread's prices as they are, so for prices set only for a region
  whose "Tax inclusive pricing" differs from its currency's, it is compared
  with the other basis.
- Product threads are for one variant. A whole-cart thread takes the cart
  as it is; it cannot hold lines that are already negotiated.
- The cart guards are middlewares on the Store API routes, not workflow
  hooks (Medusa allows one handler per hook, and other plugins use them).
  Custom code that changes cart lines or completes carts through workflows
  directly is not checked.
- A draft order gets the agreed lines only; the team adds shipping in
  Medusa's draft order editor.
- No e-mails are sent by the plugin; connect the events to your
  notification setup.
- Limits are counted in the database and are not exact under heavy
  parallel load from one customer (a few requests may slip through).

## Testing

```bash
npm run check             # typecheck and unit tests
npm run test:integration  # the module against Postgres
npm run test:http         # the whole plugin in a Medusa app (medusa-config.ts in this folder)
```

The integration tests need a Postgres (`DB_HOST`, `DB_PORT`, `DB_USERNAME`,
`DB_PASSWORD`).

## License

MIT © Bitshaft
