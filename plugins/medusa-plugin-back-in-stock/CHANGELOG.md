# Changelog

All notable changes to `@bitshaft/medusa-plugin-back-in-stock`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## [0.1.0] - 2026-11-20

First release.

- "Notify me when available" subscriptions per email, variant and sales
  channel, with optional double opt-in and a configurable consent text.
- Restock detection from inventory events with a delay and a re-check, so
  stock corrections send nothing; checks survive restarts and crashed
  workers.
- Availability computed with Medusa's own `getVariantAvailability` (channel
  stock locations, reservations, inventory kits); variants that are not
  stock-managed or backorderable count as available.
- Every waiting subscription is notified on each restock, within a minimum
  gap and a maximum number of emails; subscriptions end on purchase,
  unsubscribe or expiry.
- Each email is sent at most once, with a sent history.
- Sending through @bitshaft/medusa-plugin-emails when its template is
  registered, otherwise a built-in Polish and English template through the
  notification module. Unsubscribe link and `List-Unsubscribe` header in
  every email; links never act on GET.
- Retention rules: unconfirmed subscriptions deleted, ended ones
  anonymised, active ones expired.
- Admin page under Extensions (most wanted, subscriptions, sent history,
  settings, demo tools) and a product page widget, in Polish and English.
- Store API, a copy-in storefront component, workflows and
  `back-in-stock.*` events.
- Subscriptions keep the subscriber's full language code and pass it to
  @bitshaft/medusa-plugin-emails, which picks the store language;
  `defaultLocale` takes any BCP 47 code. The plugin's own pages and consent
  texts stay in Polish and English.
- Demo mode and demo data from the store's own catalog.
