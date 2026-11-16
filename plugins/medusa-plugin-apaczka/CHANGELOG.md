# Changelog

All notable changes to `@bitshaft/medusa-plugin-apaczka`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

First release.

- Fulfillment provider with every service on the Apaczka account: standard,
  cash-on-delivery and return variants, flat or live pricing.
- Shipments created automatically or from the order page, PDF/ZPL labels,
  courier pickups, turn-in documents and cancellation.
- Parcel locker and pickup point search for the storefront, with a copy-in
  point picker.
- Push tracking with signed webhooks, polling as a backup, and
  `apaczka.shipment.*` events.
- Apaczka page in the admin menu: all shipments with search, filters, labels,
  batch courier pickups and hand-over protocols, plus a settings tab; and a
  panel on the order page. In Polish and English.
- Missing or invalid options leave the plugin disabled with one log line
  instead of stopping Medusa.

### Security

- The tracking webhook acts only on the bytes its signature covers. A body
  with the `response` field twice passed the check with the first (genuine,
  e.g. captured) copy while `JSON.parse` returned the second (forged) one.
  Bodies with `signature` or `response` more than once are now refused.
