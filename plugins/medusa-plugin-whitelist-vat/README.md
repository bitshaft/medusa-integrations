<h1 align="center">VAT white list for Medusa</h1>

<p align="center">
  Verify business buyers in your Medusa store: Polish NIP on the Ministry of Finance white list
  (Biała lista VAT) and in the GUS REGON register, EU VAT numbers in VIES.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitshaft/medusa-plugin-whitelist-vat"><img alt="npm" src="https://img.shields.io/npm/v/@bitshaft/medusa-plugin-whitelist-vat"></a>
  <a href="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Medusa" src="https://img.shields.io/badge/medusa-%E2%89%A52.22-7c3aed">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#what-it-does">What it does</a> ·
  <a href="#storefront">Storefront</a> ·
  <a href="#admin">Admin</a> ·
  <a href="#testing">Testing</a>
</p>

---

## Requirements

- Medusa **2.22** or newer, Node.js 20.19+ or 22.12+
- Nothing else to start: the white list and VIES need no keys.
- Optional: a GUS REGON API key (free, from [api.stat.gov.pl](https://api.stat.gov.pl/Home/RegonApi)),
  one per store.

## Installation

```bash
npm install @bitshaft/medusa-plugin-whitelist-vat
```

The package has no runtime dependencies of its own. It uses the Medusa
packages your app already has (`@medusajs/framework`, `@medusajs/medusa`,
the admin SDK, UI and icons, `@medusajs/js-sdk`, `@tanstack/react-query`
and `react-router-dom`) as peer dependencies.

Register it and run the migrations:

```ts
// medusa-config.ts
plugins: [{ resolve: "@bitshaft/medusa-plugin-whitelist-vat", options: {} }]
```

```bash
npx medusa db:migrate
```

That is a working setup: every option has a default.

## Configuration

```ts
{
  resolve: "@bitshaft/medusa-plugin-whitelist-vat",
  options: {
    // GUS knows every business, not only VAT payers, and has no daily limit.
    gus: { apiKey: process.env.GUS_API_KEY },
    // Your own EU VAT number: VIES then issues a consultation number as proof.
    vies: { requesterVatNumber: "PL5260250274" },
    // Where your storefront keeps the buyer's tax ID (metadata keys).
    taxIdKeys: ["vat_number", "nip"],
    // Off by default: refuse to complete carts with a wrong tax ID.
    checkout: { rejectOnCompletion: false },
  },
}
```

| Option                        | Default                                     |                                                                                             |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `cacheTtlHours`               | `24`                                        | How long an answer is reused before the registers are asked again.                          |
| `timeoutMs`                   | `8000`                                      | Per request to a register. A slow register counts as unavailable.                           |
| `defaultCountry`              | `"PL"`                                      | Country for numbers typed without a prefix when the billing country is unknown.             |
| `mf.enabled`                  | `true`                                      | Ministry of Finance white list.                                                             |
| `mf.environment`              | `"production"`                              | `"test"` uses the ministry's test environment.                                              |
| `mf.dailyLimit`               | `95`                                        | Requests per day the plugin allows itself (the ministry permits about 100).                 |
| `vies.enabled`                | `true`                                      | EU VAT number validation.                                                                   |
| `vies.requesterVatNumber`     |                                             | Your EU VAT number, for consultation numbers.                                               |
| `gus.apiKey`                  |                                             | Turns the GUS REGON register on.                                                            |
| `gus.environment`             | `"production"`                              | `"test"` with GUS's public test key (see [Testing](#testing)).                              |
| `taxIdKeys`                   | `["vat_number", "nip", "tax_id", "vat_id"]` | Metadata keys that may hold the tax ID, in order.                                           |
| `orders.verifyOnPlaced`       | `true`                                      | Verify the buyer's tax ID when an order is placed.                                          |
| `checkout.rejectOnCompletion` | `false`                                     | Refuse to complete carts whose tax ID has one of `rejectStatuses`.                          |
| `checkout.rejectStatuses`     | `["invalid", "not_found"]`                  | Any of `invalid`, `not_found`, `unregistered`, `inactive`. `unverified` cannot be rejected. |
| `store.enabled`               | `true`                                      | The storefront lookup route.                                                                |
| `store.rateLimitPerMinute`    | `10`                                        | Lookups one visitor may make per minute.                                                    |

**Invalid options never stop Medusa.** The plugin stays disabled and logs
one line, `[whitelist-vat] Disabled: invalid options: …`; its admin page
shows the same reason.

### Environment variables

| Variable      |                                                   |
| ------------- | ------------------------------------------------- |
| `GUS_API_KEY` | GUS REGON API key, when you use the GUS register. |

The name is yours to choose; the plugin only reads options. See
[`.env.template`](./.env.template).

### Where the tax ID lives

Medusa has no tax ID field, so the plugin reads it from metadata under the
keys in `taxIdKeys`. It looks, in this order, at the billing address, the
shipping address, the cart or order itself, and the customer. Your
storefront decides where to put it, for example:

```ts
await sdk.store.cart.update(cart.id, {
  billing_address: { ...address, company: "ACME sp. z o.o.", metadata: { vat_number: "PL5260250274" } },
})
```

Numbers may be typed with or without spaces, dashes and the country prefix.
Without a prefix the billing country decides; Poland when it is unknown or
outside the EU.

## What it does

- **Checks the number locally first.** Format and check digit (NIP, EU VAT
  formats per country). Typos never reach a register.
- **Polish NIP:** asks the white list for the VAT status (active, exempt,
  not registered), the company's name, address, REGON, KRS and registered
  bank accounts. With a GUS key it also asks the REGON register, which knows
  businesses that are not VAT payers and whether a business has closed.
- **EU VAT numbers:** asks VIES and stores the consultation number.
- **Keeps the proof.** Every answer of every register is a row in the
  history with the register's own request ID and the time, linked to the
  order and customer. Orders placed with a tax ID are verified
  automatically, so each B2B order has the answers from the day of the sale.
- **Reuses answers.** A number verified in the last 24 hours (configurable)
  is not asked about again; an order still gets its own history rows
  pointing at the reused answer.
- **Never mistakes an outage for a verdict.** See below.
- **Bank account check** in the admin: is this account registered for this
  NIP on the white list today?

### Verdicts

| Status         | Meaning                                                           |
| -------------- | ----------------------------------------------------------------- |
| `active`       | Active VAT payer on the white list.                               |
| `exempt`       | On the white list as exempt from VAT.                             |
| `valid`        | EU VAT number confirmed by VIES.                                  |
| `unregistered` | A real business that is not a registered VAT payer.               |
| `inactive`     | GUS reports the business has ended its activity.                  |
| `invalid`      | Wrong format or check digit, or VIES does not confirm the number. |
| `not_found`    | The registers answered and none knows the number.                 |
| `unverified`   | **No register could be asked.** Says nothing about the number.    |

`verified` is true for `active`, `exempt` and `valid`.

### When a register is down

Registers go offline, time out, and the white list has a daily limit. All of
that yields `unverified` with `could_not_verify: true`, never `invalid`:

- a register that cannot be asked is recorded as `unavailable` in the
  history, with the reason;
- an outage never overwrites what a register said before: the earlier
  answer stays and is marked stale;
- `unverified` cannot be put in `checkout.rejectStatuses`, so a store can
  never turn buyers away because a government service is having a bad day;
- if the checkout check itself fails for any reason, the cart goes through.

### The white list's daily limit

The ministry allows about 100 requests a day and may block further access
until midnight. The plugin counts its own requests and stops at
`mf.dailyLimit` (95), reporting the white list as unavailable for the rest
of the Polish calendar day. Answers are cached for 24 hours and the
storefront route is rate limited per visitor, so the quota goes to real
buyers. A store with many B2B orders a day should add a GUS key: GUS has no
such limit and still confirms that the business exists, although only the
white list gives the VAT status.

### What it does not do

- The rate limit (`store.rateLimitPerMinute`) counts requests per visitor by `req.ip`, in
  the memory of each server process. Behind a proxy or load balancer, set
  Express `trust proxy` in your app, or every visitor shares the proxy's
  address. With several server instances, each counts on its own, so the
  effective limit is the setting times the number of instances. The daily
  white list quota (`mf.dailyLimit`) is counted in the database, so all
  instances share it.
- It does not change tax rates. A valid EU VAT number is recorded; applying
  0% reverse charge is a decision for the store or its accounting.
- It does not block checkout unless you turn `checkout.rejectOnCompletion` on.
- It does not use the ministry's daily flat file for bulk bank account checks.
- It does not re-verify stored businesses on a schedule (that would spend
  the daily limit); stale answers are marked and refreshed on demand and
  with each new order.
- It ships no storefront component, only the API below.

## Storefront

`POST /store/whitelist-vat/verify` checks a number and returns the verdict
with the company's data for the invoice form:

```ts
const { verification } = await sdk.client.fetch("/store/whitelist-vat/verify", {
  method: "POST",
  body: { number: "526-025-02-74", country_code: "pl" },
})

if (verification.could_not_verify) {
  // Registers are down: let the customer continue.
} else if (!verification.verified) {
  // verification.status says why; verification.tax_id.problem is set for typos.
}
// Autofill: verification.company.name, .street, .postal_code, .city
```

```json
{
  "verification": {
    "tax_id": { "number": "5260250274", "kind": "nip", "country_code": "PL", "valid_format": true, "problem": null },
    "status": "active",
    "verified": true,
    "could_not_verify": false,
    "company": {
      "name": "ACME SP. Z O.O.",
      "address": "UL. LIPOWA 1, 00-001 WARSZAWA",
      "street": "UL. LIPOWA 1",
      "postal_code": "00-001",
      "city": "WARSZAWA",
      "regon": "011417295",
      "krs": "0000123456"
    },
    "checked_at": "2026-11-10T10:00:00.000Z"
  }
}
```

The route needs the publishable API key like every store route, answers
HTTP 429 after `store.rateLimitPerMinute` lookups per visitor a minute, and
never returns bank accounts or register IDs.

### Rejecting carts

With `checkout.rejectOnCompletion: true`, completing a cart
(`POST /store/carts/:id/complete`) whose tax ID has one of
`checkout.rejectStatuses` fails with an `invalid_data` error naming the
number. Carts without a tax ID are not affected. The check is a middleware
on that route, so the `completeCartWorkflow` validate hook stays free for
your own code.

## Admin

**Extensions → VAT white list**

- **Overview:** counts at a glance and today's white list usage; the
  businesses verified so far with status, address, REGON/KRS and number of
  bank accounts, filtered by active, exempt and EU, needs attention, or
  stale; search by number, name or address; "check again" per business; a
  link to the customer; and the full verification history with the
  registers' request IDs.
- **Lookup:** verify any NIP or EU VAT number and see what each register
  said, the company's data and its white list bank accounts; check whether
  a bank account belongs to a NIP.
- **Settings:** the registers and options in use, read-only (they are set
  in `medusa-config.ts`). The GUS key is shown masked.

**Order and customer pages** get a panel with the record's tax ID, the
verdict, the business's data, the answers recorded for that record and a
"Verify again" button.

The admin is in English and Polish.

## Workflows and events

```ts
import {
  verifyWhitelistVatOrderWorkflow,
  verifyWhitelistVatTaxIdWorkflow,
  WhitelistVatEvents,
} from "@bitshaft/medusa-plugin-whitelist-vat/workflows"

const { result } = await verifyWhitelistVatTaxIdWorkflow(container).run({
  input: { number: "PL5260250274", customer_id: customer.id },
})
// result.status, result.verified, result.could_not_verify, result.company
```

`verifyWhitelistVatOrderWorkflow` takes `{ order_id, force? }` and verifies
the tax ID found on the order.

`whitelist-vat.tax_id.verified` is emitted after the registers were asked
(not for cached answers) with
`{ number, status, verified, could_not_verify, subject_id, order_id, customer_id }`.
Subscribe to it to flag orders for review or to tell your accounting system.

## API

Admin routes, all under `/admin/whitelist-vat` and behind admin authentication:

| Route                                                   |                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /status`                                           | Registers in use, today's white list usage, counts, options.      |
| `GET /subjects`                                         | Verified businesses; `filter`, `q`, `limit`, `offset`.            |
| `POST /subjects/:id/refresh`                            | Ask the registers about a stored business again.                  |
| `POST /verify`                                          | Manual lookup: `{ number, country_code?, force? }`.               |
| `POST /bank-account`                                    | `{ nip, account }`: is the account registered for the NIP today?  |
| `GET /checks`                                           | History; filter by `number`, `order_id`, `customer_id`, `source`. |
| `GET /orders/:id`, `GET /customers/:id`                 | Tax ID, verdict and history of a record.                          |
| `POST /orders/:id/verify`, `POST /customers/:id/verify` | Verify a record's tax ID now.                                     |

## Testing

- **White list:** `mf: { environment: "test" }` points at the ministry's
  test environment (`wl-test.mf.gov.pl`), which has its own data and limits.
- **GUS:** `gus: { apiKey: "abcde12345abcde12345", environment: "test" }` <!-- check-repo: allow-secret (public test key published by GUS) -->
  uses GUS's public test key against its test database (old, anonymised
  data). Production keys are requested at api.stat.gov.pl.
- **VIES** has no sandbox for real numbers; look up your own VAT number
  from Extensions → VAT white list → Lookup.
- Use the Lookup tab for all of the above: it shows what each register
  answered, including the reason when one is unavailable.

## Troubleshooting

- **Everything is "Could not verify":** open the Lookup tab and read the
  reason per register. Typical causes are the white list's daily limit and
  a member state's system being offline in VIES.
- **"The daily limit of 95 white list requests is used up":** it resets at
  midnight Polish time. Add a GUS key, or raise `cacheTtlHours`.
- **GUS says the key was not accepted:** check `gus.apiKey` and that
  `gus.environment` matches the key (test keys only work in `test`).
- **The order panel says "No tax ID on this record":** your storefront
  stores it under a key that is not in `taxIdKeys`.
- **A foreign number is read as Polish:** type it with its country prefix,
  or make sure the billing address has the country.

## Development

See [docs/development.md](./docs/development.md) and the repository's
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 [Bitshaft](https://bitshaft.pl). This plugin is not
affiliated with or endorsed by the Polish Ministry of Finance, Statistics
Poland (GUS) or the European Commission. See [TRADEMARKS.md](../../TRADEMARKS.md).
