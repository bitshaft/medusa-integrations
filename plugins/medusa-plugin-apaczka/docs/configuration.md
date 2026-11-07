# Configuration reference

Pass the same options object to the plugin and to the fulfillment provider
(see the [README](../README.md#install)). Options are validated at startup.
A mistake stops Medusa with a message listing every invalid field.

Money in options is in **major units**: PLN for Apaczka amounts, or your
store currency for markups. Apaczka itself works in grosze, and the plugin
converts.

## Credentials and connection

| Option        | Type                        | Default        |                                                                                                   |
| ------------- | --------------------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `appId`       | `string`                    | **required**   | Apaczka panel → Settings → API                                                                    |
| `appSecret`   | `string`                    | **required**   | Keep it in an environment variable                                                                |
| `environment` | `"production" \| "sandbox"` | `"production"` | Sandbox and production credentials are different                                                  |
| `baseUrl`     | `string`                    | —              | Override the API URL (rarely needed)                                                              |
| `timeoutMs`   | `number`                    | `15000`        | Per request                                                                                       |
| `maxRetries`  | `0–5`                       | `2`            | Read calls only. Order creation, cancellation and pickups are never retried, to avoid duplicates. |

## Sender

| Option             | Type                              | Default |                                                      |
| ------------------ | --------------------------------- | ------- | ---------------------------------------------------- |
| `sender`           | `Sender`                          | `{}`    | Defaults merged under every stock location's address |
| `senderByLocation` | `Record<stockLocationId, Sender>` | `{}`    | Per-location overrides                               |

`Sender` fields: `name`, `contactPerson`, `email`, `phone`, `line1`, `line2`,
`postalCode`, `city`, `countryCode`, `isResidential`, `pointId` (drop-off
point for services that start at a point).

Precedence: `senderByLocation[id]` → the stock location's address → `sender`.
Medusa stock locations have no e-mail or contact person, so set at least
`sender.email`.

## Behaviour

| Option                | Type                      | Default                 |                                                                                                                                                                                                   |
| --------------------- | ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shipmentCreation`    | `"auto" \| "manual"`      | `"auto"`                | `manual`: staff create shipments from the order page                                                                                                                                              |
| `labelFormat`         | `"pdf" \| "zpl"`          | `"pdf"`                 | `zpl` for thermal printers                                                                                                                                                                        |
| `enabledServices`     | `number[]`                | `[]` (all)              | Service IDs offered in the admin                                                                                                                                                                  |
| `offerCodVariants`    | `boolean`                 | `true`                  | Add a "— COD" option per service                                                                                                                                                                  |
| `offerReturnVariants` | `boolean`                 | `true`                  | Add a "— return" option for door-delivery services                                                                                                                                                |
| `contentTemplate`     | `string`                  | `"Order #{display_id}"` | Placeholders: `{display_id}`, `{order_id}`, `{items}`                                                                                                                                             |
| `commentTemplate`     | `string`                  | —                       | Same placeholders                                                                                                                                                                                 |
| `defaultOptions`      | `Record<optionId, value>` | `{}`                    | Apaczka additional services for every order (IDs from Settings → Apaczka / `service_structure`)                                                                                                   |
| `notifications`       | object                    | —                       | Apaczka's own e-mail/SMS notifications, e.g. `{ new: { isReceiverEmail: true, isReceiverSms: false, isSenderEmail: false, isSenderSms: false } }`. Keys: `new`, `sent`, `exception`, `delivered`. |

## Parcels (`parcel`)

| Option                | Default                                 |                                                                |
| --------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `strategy`            | `"single"`                              | `single`: one parcel per fulfillment; `per_item`: one per unit |
| `packageType`         | `"PACZKA"`                              | From `service_structure.package_type`                          |
| `weightUnit`          | `"g"`                                   | Unit of `variant.weight` in your catalog (`g` or `kg`)         |
| `dimensionUnit`       | `"cm"`                                  | Unit of variant dimensions (`mm`, `cm`, `m`)                   |
| `defaultItemWeightKg` | `1`                                     | For variants without a weight                                  |
| `packagingWeightKg`   | `0`                                     | Added to each parcel                                           |
| `minWeightKg`         | `0.1`                                   |                                                                |
| `defaultDimensionsCm` | `{ length: 30, width: 20, height: 10 }` | Used for multi-item parcels and items without dimensions       |
| `nonStandard`         | `false`                                 | Mark parcels as non-standard                                   |

For real box packing, pass `buildParcels(context) => ApaczkaParcel[]`.

## Pricing (`pricing`)

Used by **Calculated** shipping options.

| Option                  | Default   |                                                                                                                                            |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `basis`                 | `"gross"` | Charge Apaczka's gross or net price                                                                                                        |
| `markupPercent`         | `0`       | Applied first; can be negative                                                                                                             |
| `markupFixed`           | `0`       | Added after the percentage                                                                                                                 |
| `roundUpTo`             | —         | Round up to a multiple, e.g. `1` → 13.00, `0.5` → 12.50                                                                                    |
| `freeShippingThreshold` | —         | Free when the cart subtotal ≥ this amount                                                                                                  |
| `fallbackAmount`        | —         | Charged if Apaczka can't price the cart. **Recommended:** without it, one failing option makes Medusa fail the whole shipping option list. |
| `exchangeRates`         | `{}`      | PLN → currency multipliers for non-PLN carts, e.g. `{ eur: 0.23 }`                                                                         |

## Pickup (`pickup`)

| Option                  | Default               |                                                                  |
| ----------------------- | --------------------- | ---------------------------------------------------------------- |
| `type`                  | `"SELF"`              | `SELF`: you drop parcels off; `COURIER`: a courier collects them |
| `hoursFrom` / `hoursTo` | `"09:00"` / `"16:00"` | Courier window                                                   |
| `minDaysAhead`          | `0`                   | First pickup day at least this many days ahead                   |

Services that require a courier always get one. Services without courier
pickup always use `SELF`. The date is the first available day from Apaczka's
`pickup_hours`.

## Cash on delivery (`cod`) and insurance (`insurance`)

| Option              | Default  |                                                                                    |
| ------------------- | -------- | ---------------------------------------------------------------------------------- |
| `cod.bankAccount`   | —        | IBAN for COD payouts                                                               |
| `cod.bankAccountId` | —        | Or the ID of an account saved in the Apaczka panel                                 |
| `insurance.mode`    | `"none"` | `order_total`: declare the fulfilled items' value; `fixed`: use `insurance.amount` |
| `insurance.amount`  | —        | PLN, for `fixed`                                                                   |

COD shipments collect only what the customer still owes (the order total
minus payments), converted to PLN with `pricing.exchangeRates` for other
currencies. When an order ships in several parcels, each one collects a
share proportional to its items' value, and the last one collects the rest,
so the parcels add up exactly to what is owed. Staff can change the amount
when creating a shipment by hand. The declared value is always at least the
COD amount.

## Per-service overrides (`services`)

```ts
services: {
  "41": {                       // service_id
    name: "Paczkomat InPost 24/7",
    pricing: { markupFixed: 2 },
    parcel: { packageType: "PACZKA", defaultDimensionsCm: { length: 38, width: 64, height: 8 } },
    pickup: { type: "SELF" },
    options: { "19": 1 },       // Apaczka additional services for this service only
  },
}
```

Overrides only change the fields they set. Everything else falls back to the
global options.

## Tracking

| Option                   | Default |                                                                                                  |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `webhooks.backendUrl`    | —       | Your backend's public URL. Orders get `push_tracking_url = <backendUrl>/hooks/apaczka/tracking`. |
| `tracking.polling`       | `true`  | Poll active shipments every 30 minutes as a backup                                               |
| `tracking.markShipped`   | `true`  | Mark the Medusa fulfillment shipped when the carrier takes the parcel                            |
| `tracking.markDelivered` | `true`  | Mark it delivered on delivery                                                                    |

## Caching

| Option                       | Default  |                                                                                                                                                                            |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceStructureTtlMinutes` | `1440`   | Service list cache (also refreshed by a daily job)                                                                                                                         |
| `pointsTtlMinutes`           | `720`    | Parcel point list cache, per type and country                                                                                                                              |
| `pointTypes`                 | `{}`     | Supplier → `points/{type}/` code, for suppliers whose code differs                                                                                                         |
| `pointCountries`             | `["PL"]` | Countries the store API returns points for. Add e.g. `"CZ"` for Packeta. Other countries, and point types your account doesn't have, are rejected before reaching Apaczka. |

## Code hooks

| Option           | Signature                                                             |                                                                           |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `buildParcels`   | `(context) => ApaczkaParcel[]`                                        | Replace parcel building                                                   |
| `transformOrder` | `(order, { purpose, serviceId, isReturn, orderId, cartId }) => order` | Edit the payload before every valuation and order creation. May be async. |

`purpose` is `"valuation"` or `"shipment"`. Keep both consistent so quotes
match the final price.
