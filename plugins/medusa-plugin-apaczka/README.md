<h1 align="center">Apaczka.pl for Medusa</h1>

<p align="center">
  Ship with 20+ Polish and international carriers from your Medusa store through one
  <a href="https://www.apaczka.pl">Apaczka.pl</a> account. InPost, DPD, DHL, UPS, GLS, Pocztex, Orlen Paczka, FedEx and more.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitshaft/medusa-plugin-apaczka"><img alt="npm" src="https://img.shields.io/npm/v/@bitshaft/medusa-plugin-apaczka"></a>
  <a href="https://github.com/bitshaft/medusa-plugin-apaczka/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bitshaft/medusa-plugin-apaczka/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Medusa" src="https://img.shields.io/badge/medusa-%E2%89%A52.22-7c3aed">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="./docs/configuration.md">Configuration</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="./storefront/README.md">Storefront</a> ·
  <a href="./docs/README.pl.md">Po polsku</a>
</p>

---

## Features

- **Every service on your account.** Read from Apaczka, never hardcoded, and refreshed daily. Each service is available as a standard, cash-on-delivery and return shipping option.
- **Live rates or flat rates** per shipping option, with markups, rounding, free-shipping thresholds, per-service overrides and a fallback price so checkout keeps working if Apaczka is down.
- **Parcel lockers and pickup points.** Point validation at checkout (including COD support at the point) and a map-and-list point picker for the storefront.
- **Labels automatically or by hand.** PDF or ZPL for thermal printers. In manual mode staff can adjust parcels, service, pickup, COD, insurance and the point before creating the shipment.
- **Courier pickups** for one shipment or many (batch), using Apaczka's available pickup days.
- **Return labels** created as soon as a return is requested.
- **Tracking** by signed webhooks with polling as a backup. Fulfillments are marked shipped and delivered in Medusa, and events are emitted for your own notifications.
- **Admin panel** on the order page plus a settings page with a connection check, in Polish and English.
- **Multi-warehouse.** The sender address comes from each stock location, with per-location overrides.
- **Built to be safe.** HMAC request signing, webhook signature verification against the raw request body, no retries on order creation (so no duplicate orders), every workflow step undone on failure, money handled as integers.

## Requirements

- Medusa **2.22** or newer, Node.js 20.19+ or 22.12+
- An Apaczka.pl account with WebAPI access (Apaczka panel → **Settings → API**)

## Install

```bash
npm install @bitshaft/medusa-plugin-apaczka
```

### 1. Register the plugin and the fulfillment provider

The plugin (shipment records, admin UI, webhooks, jobs) and the fulfillment
provider (rates, labels) share one options object:

```ts
// medusa-config.ts
import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const apaczka = {
  appId: process.env.APACZKA_APP_ID!,
  appSecret: process.env.APACZKA_APP_SECRET!,
  environment: (process.env.APACZKA_ENV as "production" | "sandbox") ?? "production",
  sender: {
    // Medusa stock locations have no e-mail or contact person; set them here.
    contactPerson: "Jan Kowalski",
    email: "magazyn@twojsklep.pl",
  },
  webhooks: { backendUrl: process.env.MEDUSA_BACKEND_URL },
}

export default defineConfig({
  projectConfig: {/* … */},
  plugins: [{ resolve: "@bitshaft/medusa-plugin-apaczka", options: apaczka }],
  modules: [
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          // Keep Medusa's manual provider if you use it.
          { resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" },
          { resolve: "@bitshaft/medusa-plugin-apaczka/providers/apaczka", id: "apaczka", options: apaczka },
        ],
      },
    },
  ],
})
```

```bash
# .env
APACZKA_APP_ID=...
APACZKA_APP_SECRET=...
APACZKA_ENV=sandbox            # switch to production when ready
MEDUSA_BACKEND_URL=https://api.twojsklep.pl
```

### 2. Run the migrations

```bash
npx medusa db:migrate
```

### 3. Create shipping options

1. In the admin, open **Settings → Locations**, pick a location and enable the
   **apaczka** fulfillment provider.
2. In a shipping zone, click **Create option**, choose the **apaczka** provider
   and pick a service, such as "INPOST Paczkomat" or "DPD Kurier — COD".
3. Choose a **Fixed** price or **Calculated** (a live Apaczka quote, with your
   pricing rules applied).

**Settings → Apaczka** shows whether the connection works and which services
your account has.

### 4. Add the point picker to your storefront

For locker and pickup-point services, the customer has to choose a point. Copy
the [storefront kit](./storefront/README.md) into your storefront and send the
point with the shipping method:

```ts
await sdk.store.cart.addShippingMethod(cart.id, { option_id, data: { point_id: "WAW01M" } })
```

## How it works

```
Checkout                 Fulfillment                   Carrier                     Medusa
────────                 ───────────                   ───────                     ──────
price (live/flat)  ──►   Apaczka order + label   ──►   webhook / polling    ──►    shipped → delivered
point validated          (auto or from admin)          status changes              apaczka.* events
```

- **Creating shipments.** With `shipmentCreation: "auto"` (the default), the
  Apaczka order is created when you create a fulfillment in Medusa, and the
  label is attached to it. With `"manual"`, the fulfillment is created first
  and staff create the shipment from the **Apaczka shipments** panel on the
  order page. That lets them check the price and adjust parcels, pickup, COD
  or the point first.
- **Sender address.** Built from the stock location's address, merged with
  `sender` (global defaults) and `senderByLocation` (per location). If the
  provider can't resolve a full sender, the shipment waits in the order panel
  with the reason shown.
- **Returns.** Return shipping options work like outbound ones. The return
  label is created right after the return is requested (or by hand in manual
  mode).
- **Tracking.** Apaczka pushes signed status updates to
  `POST /hooks/apaczka/tracking`. A job polls active shipments every 30
  minutes as a backup. The plugin marks fulfillments shipped and delivered,
  and emits events you can subscribe to.
- **Cancellation.** Cancelling a fulfillment in Medusa cancels the Apaczka
  order. Apaczka refuses once the carrier has the parcel, and the plugin shows
  that message.

### Webhooks

Set `webhooks.backendUrl` and every order is created with its own webhook URL.
You can also paste `https://<your-backend>/hooks/apaczka/tracking` once into
the Apaczka panel (**Settings → WebAPI**). Requests are rejected unless their
HMAC signature matches your app secret.

### Events

| Event                               | When                                                 |
| ----------------------------------- | ---------------------------------------------------- |
| `apaczka.shipment.created`          | An Apaczka order was created for a fulfillment       |
| `apaczka.shipment.status_changed`   | Any status change (`status`, `previous_status`)      |
| `apaczka.shipment.shipped`          | The carrier took the parcel                          |
| `apaczka.shipment.ready_for_pickup` | Waiting in a locker or pickup point                  |
| `apaczka.shipment.delivered`        | Delivered                                            |
| `apaczka.shipment.exception`        | Failed delivery attempt, notice left, unknown status |
| `apaczka.shipment.returned`         | Returned to sender (including uncollected parcels)   |
| `apaczka.shipment.canceled`         | Canceled                                             |
| `apaczka.pickup.booked`             | A courier pickup was booked                          |

```ts
// src/subscribers/parcel-ready.ts — e.g. text the customer
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

export default async function parcelReady({ event }: SubscriberArgs<{ order_id: string; tracking_url: string }>) {
  // send an SMS / e-mail with event.data.tracking_url
}

export const config: SubscriberConfig = { event: "apaczka.shipment.ready_for_pickup" }
```

## Customizing

Most behaviour is set through [options](./docs/configuration.md): pricing per
service, parcel sizing, pickup windows, COD payout account, insurance,
Apaczka's own e-mail/SMS notifications, label format, content templates, and
which services appear in the admin.

For anything else there are code hooks, so you don't need a fork:

```ts
const apaczka = {
  // …
  // Your own box-packing logic
  buildParcels: ({ items, options }) => [{ dimension1: 40, dimension2: 30, dimension3: 20, weight: 3 }],
  // Edit the payload right before it is priced or sent
  transformOrder: (order, { purpose, isReturn }) => ({ ...order, comment: isReturn ? "RMA" : order.comment }),
}
```

The workflows are exported for use in your own code:

```ts
import {
  createApaczkaShipmentWorkflow,
  bookApaczkaPickupWorkflow,
  syncApaczkaTrackingWorkflow,
} from "@bitshaft/medusa-plugin-apaczka/workflows"

await createApaczkaShipmentWorkflow(container).run({
  input: { fulfillment_id, overrides: { parcels: [{ weight: 2, length: 30, width: 20, height: 10 }] } },
})
```

You can also pass `additional_data.apaczka` when creating a fulfillment through
Medusa's API: `{ defer: true }` skips automatic creation, and `{ overrides }`
adjusts the shipment.

## API

| Route                                                      |                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /store/apaczka/points?type=INPOST&q=&lat=&lng=&cod=`  | Search parcel points (cached on the server)                |
| `GET /store/apaczka/points/:type/:id`                      | One point                                                  |
| `POST /hooks/apaczka/tracking`                             | Apaczka push tracking (signed)                             |
| `GET /admin/apaczka/status`                                | Connection check and configuration summary                 |
| `GET /admin/apaczka/services`                              | Services, additional options and package types             |
| `GET /admin/apaczka/shipments?order_id=`                   | Shipments with tracking history                            |
| `POST /admin/apaczka/fulfillments/:id/valuation`           | Price a shipment before creating it                        |
| `POST /admin/apaczka/fulfillments/:id/shipment`            | Create the shipment (with overrides)                       |
| `POST /admin/apaczka/shipments/:id/sync`                   | Refresh tracking now                                       |
| `GET /admin/apaczka/orders/:id/documents/waybill`          | Label (PDF/ZPL), also used as the Medusa label URL         |
| `GET /admin/apaczka/orders/:id/documents/dispatch_code`    | Drop-off code                                              |
| `POST /admin/apaczka/turn-in`                              | Hand-over (turn-in) confirmation PDF for several shipments |
| `GET /admin/apaczka/pickup-hours?postal_code=&service_id=` | Available courier pickup days                              |
| `POST /admin/apaczka/pickups`                              | Book a courier pickup                                      |

## Testing against the sandbox

Use `environment: "sandbox"` with sandbox credentials while developing.
Production orders are real orders with real couriers and invoices.

```bash
APACZKA_SANDBOX_APP_ID=... APACZKA_SANDBOX_APP_SECRET=... npm run test:sandbox
# also create and cancel a real sandbox order:
APACZKA_SANDBOX_WRITE=true ... npm run test:sandbox
```

Sandbox limitations (from Apaczka): `tracking/` and `dispatch_code/` are not
available, `points/` may time out, the service list is smaller and its IDs
differ from production, and courier pickups through the API must be enabled
on the account by Apaczka support.

## Troubleshooting

| Problem                                                   | Fix                                                                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| "Invalid signature" / settings page shows not connected   | Check `appId`/`appSecret`, and that `environment` matches the credentials. Sandbox and production keys are different.                           |
| Shipping options fail at checkout                         | A calculated option failing makes Medusa fail the whole list. Set `pricing.fallbackAmount`, and make sure the cart has a full shipping address. |
| "Apaczka prices are in PLN, but the cart is in EUR"       | Add `pricing.exchangeRates: { eur: 0.23 }`, or use fixed prices for that currency.                                                              |
| Shipment stays "Not created" with a sender-address reason | Fill in the stock location's address, or set `sender` / `senderByLocation`.                                                                     |
| COD orders are rejected                                   | Set `cod.bankAccount` (IBAN) or `cod.bankAccountId`.                                                                                            |
| Courier booking fails                                     | Ask Apaczka support to enable "pickup via API" on your account.                                                                                 |
| No tracking updates                                       | Check the webhook URL on the settings page. Polling also needs the shipment to have a tracking number.                                          |

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).
Report security issues privately ([SECURITY.md](./SECURITY.md)).

## License

[MIT](./LICENSE) © [bitshaft](https://bitshaft.pl)

Built and maintained by **[bitshaft](https://bitshaft.pl)**, a Medusa and e-commerce
engineering studio. Need help with an implementation or a custom integration?
[Get in touch](https://bitshaft.pl).

<sub>Apaczka and Apaczka.pl are trademarks of Alsendo sp. z o.o. This plugin is an
independent integration built on the public Apaczka WebAPI v2.</sub>
