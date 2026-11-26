# Changelog

All notable changes to `@bitshaft/medusa-plugin-apaczka`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## [0.2.0] - 2026-11-26

### Added

- Parcel point lists are stored in the database (`apaczka_point`,
  `apaczka_point_sync`, new migration) instead of being held in memory, once
  for the module and the fulfillment provider together. A list older than
  `pointsTtlMinutes` is refreshed in the background while searches keep
  using it; only a carrier with no list yet makes the first search wait.
  One sync per list at a time, also across processes; a failed sync is
  retried after 15 minutes.
- `livePoints` option: with `demo: true`, parcel points come from your
  Apaczka account while everything else stays demo. The points request is
  the only call that reaches Apaczka. The keys live only inside that
  request: the client, the module and the provider keep placeholders, so no
  logged object or admin response can contain them, and a demo store
  rejects real Apaczka webhooks.
- `bbox=west,south,east,north` on `GET /store/apaczka/points`, for loading
  the points of a map area; `limit` goes up to 500.
- **Settings → Parcel points** in the admin: every stored list with its
  count, last sync and state, and "Sync now"
  (`GET /admin/apaczka/points`, `POST /admin/apaczka/points/sync`). "Sync
  now" is refused within 5 minutes of a list's last sync attempt and says
  why a sync failed. Store searches only say the points are not available:
  the store API is public, and Apaczka's error would tell anyone the keys
  don't work.
- Storefront kit: `bbox` in `searchPoints` and `usePointSearch`.

### Changed

- `ApaczkaCatalog` no longer has `getPoints` or the `pointsTtlMs` and
  `maxPointLists` settings; point searches go through the stored lists.

## [0.1.0] - 2026-11-20

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
- Demo mode (`demo: true`): no credentials and no requests to Apaczka;
  sample services, prices, parcel points, labels, pickups and tracking that
  moves on by itself, with a demo bar on the admin page.

### Security

- The tracking webhook acts only on the bytes its signature covers. A body
  with the `response` field twice passed the check with the first (genuine,
  e.g. captured) copy while `JSON.parse` returned the second (forged) one.
  Bodies with `signature` or `response` more than once are now refused.
