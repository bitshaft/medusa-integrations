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
- Admin widget and settings page in Polish and English.
- Missing or invalid options leave the plugin disabled with one log line
  instead of stopping Medusa.
