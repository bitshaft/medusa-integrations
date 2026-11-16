# Compliance for Medusa v2: GPSR, GDPR, Omnibus

`@bitshaft/medusa-plugin-compliance` · [Polska wersja](./docs/README.pl.md)

Three modules in one plugin, each switched on separately in the admin:

1. **GPSR**: product safety data (manufacturer, responsible person in the
   EU, identification, warnings) with a completeness check.
2. **GDPR**: an append-only consent register and data subject requests
   (access, portability, erasure with anonymisation, objection to
   marketing, rectification).
3. **Omnibus**: price history of every variant and the lowest price in the
   period before each discount.

One admin page (**Compliance**, in Polish and English), widgets on the
product and customer pages, a small Store API and a demo mode.

> **Legal notice.** This plugin is a tool. It is not legal advice and does
> not guarantee that your store complies with GPSR, GDPR, the Omnibus rules
> or any other law. Periods, scopes and exceptions are settings with
> default values; whether they fit your store is for you and your lawyer to
> decide. The plugin ships no legal texts: every consent, notice and policy
> field starts as `[DO UZUPEŁNIENIA PRZEZ PRAWNIKA]` ("to be completed by a
> lawyer").

## Requirements

- Medusa `^2.22.0` (tested with 2.22.3)
- Node.js `^20.19.0 || >=22.12.0`

## Installation

```bash
npm install @bitshaft/medusa-plugin-compliance
```

```ts
// medusa-config.ts
module.exports = defineConfig({
  plugins: [
    {
      resolve: "@bitshaft/medusa-plugin-compliance",
      options: {
        // all optional; these are the defaults
        timeZone: "Europe/Warsaw",
        defaultLocale: "pl",
        // modules of other plugins that add data to GDPR exports
        dataProviders: [],
      },
    },
  ],
})
```

```bash
npx medusa db:migrate
```

The page appears in the main menu as **Compliance** (**Zgodność** in
Polish). On first start all three modules are on and the hourly job takes
a snapshot of every price.

## Configuration

The plugin options are technical only:

| Option          | Default         |                                                                               |
| --------------- | --------------- | ----------------------------------------------------------------------------- |
| `timeZone`      | `Europe/Warsaw` | Time zone for dates                                                           |
| `defaultLocale` | `pl`            | Language of Store API messages when the request names none                    |
| `dataProviders` | `[]`            | Other modules that add data to exports, see [Data providers](#data-providers) |

Invalid options never stop Medusa: the plugin stays disabled, logs one
line (`[compliance] Disabled: …`) and the admin page shows the reason.

Everything else is a setting on the **Settings** tab:

- modules on or off, demo mode;
- GPSR: which optional fields are required (trade name, type, model,
  marking photo, warnings and their languages);
- GDPR: deadline for answers (30 days), warning before it (7 days),
  confirmation link lifetime (48 h), the storefront confirmation page
  (`{token}` placeholder), privacy policy link, the message shown after a
  request, rate limits (3 per e-mail, 10 per IP per 60 minutes);
- anonymisation scope: placeholder text, customer metadata, order e-mail,
  phones, shipping address, billing address (kept by default) and the
  **billing data retention period** (72 months from the order date; a
  daily job removes billing addresses after it), open carts;
- Omnibus: the period (30 days), whether automatic promotions and
  promotion codes count as discounts, the country used for tax in
  multi-country regions, and exceptions per product or category.

The **Guide** tab explains each default and lists what to check with a
lawyer.

## What it does

### GPSR

- Product data: manufacturer (name, trade name or trademark, postal and
  electronic address), responsible person in the EU (required when the
  manufacturer is outside the EU), product type, model, batch or serial
  number (when it applies), a photo of the marking, and warnings in
  Markdown for each of the store's languages (Settings → Store, with
  Medusa's Translation module; otherwise the plugin's `defaultLocale`).
  The settings choose which languages are required. **Settings →
  Translations** gets a card pointing to these texts and to consent texts.
- Manufacturer profiles are saved once and attached to many products;
  every field can be overridden on the product.
- Products without the required data publish as usual. The admin shows how
  many products miss data and which fields, with a link to each product.
  A daily job checks every product; a product change checks it at once.

### GDPR

- **Consent types** with a key, name, text (Polish and English), version,
  "required" flag and placement (registration, checkout, account,
  newsletter, cookies). A changed text becomes a new version; old ones
  stay.
- **Consent entries** for a customer, an e-mail address or an anonymous
  browser id: type, text version, given or withdrawn, date, source.
  Append-only (a database trigger refuses changes); withdrawing is a new
  entry. Cookie choices (necessary, analytics, marketing) are stored by
  the browser id and linked to the customer after sign-in. The banner is
  the storefront's job.
- **Requests**: submitted through the Store API (signed in or by e-mail),
  confirmed with a link from the e-mail, then handled in the admin with a
  deadline and a warning before it. Every request has a history (who,
  when, what); rejecting needs a reason. Requests are never deleted.
- **Access and portability**: the admin downloads a ZIP with `data.json`
  and CSV files: profile, addresses, orders, consents, requests and the
  data of registered providers.
- **Erasure**: after the admin accepts, the customer is anonymised by a
  workflow (each step is undone on failure):
  - name, e-mail (`anon-<id>@invalid`, unique, so the person can sign up
    again with the real address), phone, company and metadata are
    replaced; `has_account` becomes `false`; saved addresses are deleted;
  - orders keep amounts, items and taxes; their e-mail, phones and shipping
    address are replaced; billing addresses stay until the retention period
    ends (settings);
  - open carts are anonymised;
  - the login (auth identity) is removed, and sessions and tokens already
    issued are refused from then on (see [Limitations](#limitations));
  - `compliance.customer_anonymized` tells other plugins to remove their
    data.
- **Objection to marketing**: accepting it withdraws the person's
  newsletter and marketing-cookie consents (events are emitted).
- **Rectification** points to editing the account; the request is only
  recorded.

### Omnibus

- Every change of a variant's price is recorded per region and currency,
  with tax, as the customer sees it, with the date. The first run takes a
  snapshot of all current prices.
- A discount is an active `sale` price list and, if enabled, an automatic
  promotion without cart conditions (it lowers the price on the product
  page). Promotion codes are skipped unless enabled.
- For each discount the plugin finds the lowest price in the period
  before it began (30 days by default). Products on sale for less than
  the period use the time since sales started. When the history is
  shorter than the period because the plugin was installed recently, the
  price is marked `history_incomplete` and listed in the admin.
- Exceptions per product or category (off by default): `exempt` (no
  lowest price shown, e.g. perishable goods) and `gradual` (a run of
  price cuts counts from the first cut).
- The admin shows a price history widget (table and chart) on each
  product, the products on discount with the lowest price, and the
  discounts with incomplete history.

### Demo mode

A switch in the settings. The admin then shows sample data (products
missing GPSR data, requests in different states, prices with discounts),
refuses every change except to the settings, and shows a "Demo mode" bar
on every page. The storefront and the Store API keep using real data.

## Events

| Event                             | Payload                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `compliance.consent_granted`      | `{ id, type_key, version, customer_id, email, anonymous_id, placement, source }` |
| `compliance.consent_withdrawn`    | same as above                                                                    |
| `compliance.request_verification` | `{ id, type, email, customer_id, locale, token, verify_url, expires_at }`        |
| `compliance.request_opened`       | `{ id, type, email, customer_id, deadline_at }`                                  |
| `compliance.request_due_soon`     | `{ id, type, email, deadline_at }`                                               |
| `compliance.request_closed`       | `{ id, type, status, email, customer_id, reason }`                               |
| `compliance.customer_anonymized`  | `{ customer_id, request_id }`                                                    |

The plugin sends no e-mails. An e-mail plugin listens to
`compliance.request_verification` and sends `verify_url` (built from the
"confirmation page" setting) or the bare `token`.

## Store API

Everything is under `/store/compliance`. Refusals have a `code`, a
`message` in the customer's language (`locale`, `x-medusa-locale` or
`Accept-Language`; Polish by default) and both texts in `messages`.
Every rule is checked on the server.

| Route                                              |                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /gpsr/products/:id?locale=de`                 | GPSR data for the product page (warnings as HTML, Markdown, text) in that language, else the default one |
| `GET /omnibus/variants/:id?region_id=`             | Omnibus data of a variant                                                                                |
| `GET /omnibus/products/:id?region_id=`             | The same for every variant of a product                                                                  |
| `GET /consents/types?placement=checkout&locale=pl` | Active consent types with the current text and version                                                   |
| `GET /consents?anonymous_id=`                      | Current choices of the signed-in customer or of a browser                                                |
| `POST /consents`                                   | Give or withdraw consents                                                                                |
| `POST /consents/link`                              | After sign-in: link the browser's cookie choices to the customer                                         |
| `POST /requests`                                   | Submit a request (rate limited)                                                                          |
| `POST /requests/verify`                            | Confirm a request with the token from the e-mail                                                         |

```ts
// Omnibus data for a variant in the customer's region
const { omnibus } = await sdk.client.fetch(`/store/compliance/omnibus/variants/${variantId}`, {
  query: { region_id: region.id },
})
// {
//   known: true, price: 98.4, regular_price: 123, discounted: true,
//   lowest_price: 110.7, period_days: 30, discount_started_at: "2026-11-02T…",
//   history_incomplete: false, sold_since: null, exempt: false,
//   formatted: { price: "98,40 zł", regular_price: "123,00 zł", lowest_price: "110,70 zł", … }
// }

// Cookie banner: save choices for this browser, then link after sign-in
await sdk.client.fetch("/store/compliance/consents", {
  method: "POST",
  body: {
    anonymous_id, // a random id the storefront keeps in a first-party cookie
    placement: "cookies",
    choices: [
      { type_key: "cookies.analytics", granted: true, version: 1 },
      { type_key: "cookies.marketing", granted: false },
    ],
  },
})
await sdk.client.fetch("/store/compliance/consents/link", { method: "POST", body: { anonymous_id } })

// Data subject request; the person then clicks the link from the e-mail
await sdk.client.fetch("/store/compliance/requests", {
  method: "POST",
  body: { type: "erasure", email: "anna@example.com" },
})
await sdk.client.fetch("/store/compliance/requests/verify", { method: "POST", body: { token } })
```

A grant must name the current version of the text (or none, meaning the
current one); an older version is refused with `consent_version_outdated`
so the storefront shows the new text. Required consents cannot be
withdrawn through the Store API. Consent state is not available by e-mail
address, so nobody can look up someone else's choices.

## Data providers

Other plugins (or your app) can add their data to GDPR exports without
importing this plugin. List them in the options:

```ts
options: {
  dataProviders: [{ module: "loyalty", method: "exportCustomerData", label: "loyalty" }],
}
```

During an export the plugin calls
`container.resolve(module)[method](customerId, email)`. Return any
JSON-serialisable object or array; it lands in `data.json` under
`providers.<label>` and, for arrays of objects, in
`providers/<label>.csv`. A provider that throws is noted in the export
and logged; the export still completes.

To remove your data after an erasure, subscribe to
`compliance.customer_anonymized`.

## Admin

**Compliance** in the main menu, with tabs:

- **Overview**: each module on or off with its problems: products missing
  GPSR data, open requests with the nearest deadline, products on
  discount, discounts with incomplete history.
- **GPSR**: products missing data, manufacturer profiles.
- **GDPR**: requests (details, history, actions, data package), consent
  types with versions, the consent register.
- **Omnibus**: discounts with the lowest prior price, incomplete history.
- **Settings** and **Guide**.

Widgets: GPSR data and price history on the product page; consents,
requests and a data download on the customer page.

## Jobs and hooks

| Job                 | Schedule           |                                                                    |
| ------------------- | ------------------ | ------------------------------------------------------------------ |
| `compliance-prices` | every hour (`:05`) | Records changed prices; takes the first snapshot                   |
| `compliance-daily`  | daily 03:20        | GPSR check, request deadlines and expired links, billing retention |

Subscribers record prices right after `pricing.price.*`, `price-list.*`
and `promotion.*` events and re-check a product's GPSR data after
`product.created`/`product.updated`. The workflow
`anonymize-compliance-customer` is exported from
`@bitshaft/medusa-plugin-compliance/workflows`. A middleware on
`/store/*`, `/auth/token/refresh` and `/auth/session` refuses sessions and
tokens of anonymised customers.

## Limitations

- **Not legal advice.** See the notice at the top.
- **Omnibus**
  - A discount that starts or ends on a schedule (price list or
    campaign dates) emits no event; it is recorded by the hourly job, so
    up to an hour late.
  - Promotions are evaluated on a one-item cart: promotions with cart
    conditions (customer group, minimum amount, buy X get Y) do not count.
    Fixed-amount promotions are taken off the gross price.
  - Price lists limited to customer groups do not apply to an anonymous
    product page and are not recorded.
  - Prices are recorded with the tax of one country per region (setting).
  - Only published products are recorded. Prices from before the
    installation are unknown: those discounts are marked incomplete.
- **GDPR**
  - Sessions and tokens of an anonymised customer are refused within a
    minute on every server (the list is cached per process for 60 s; at
    once on the server that ran the anonymisation).
  - Anonymisation covers the Customer, Order, Cart and Auth modules.
    Data held by payment or shipping providers, other plugins (they get
    `compliance.customer_anonymized`) and sent e-mails is not touched.
  - Consent entries and request records keep the e-mail address as proof
    of consent and of handling; they are append-only.
  - The IP rate limit uses `req.ip`; behind a proxy, set Express
    `trust proxy` in your app.
- **GPSR**
  - No storefront components; the product page shows the data from the
    Store API.
  - No bulk import of GPSR data yet; use profiles.

## Testing

```bash
npm run check
npm run test:integration   # needs Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD
```

The integration tests run the real Pricing and Promotion modules for
Omnibus, and the real anonymisation workflow for GDPR.

## License

MIT © Bitshaft
