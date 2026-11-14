# Changelog

All notable changes to `@bitshaft/medusa-plugin-compliance`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

First release.

- GPSR: manufacturer, responsible person in the EU, identification and
  warnings per language on each product; manufacturer profiles with
  per-product overrides; completeness check daily and on product change;
  Store API for the product page.
- GDPR: versioned consent types; append-only consent register for
  customers, e-mail addresses and anonymous browsers (cookies), linked
  after sign-in; data subject requests confirmed by e-mail, with deadlines,
  warnings, history and rate limits; data export (JSON and CSV in a ZIP)
  with data providers from other plugins; anonymisation workflow with a
  billing data retention period; sessions and tokens of anonymised
  customers are refused.
- Omnibus: price history per variant, region and currency with tax;
  snapshot on first run; sale price lists and optional promotions as
  discounts; lowest price before a discount with "sold since" and
  "incomplete history"; exceptions per product or category; Store API.
- Admin page "Compliance" (overview, GPSR, GDPR, Omnibus, settings, guide),
  product and customer widgets, demo mode; Polish and English.
- Events: `compliance.consent_granted`, `consent_withdrawn`,
  `request_verification`, `request_opened`, `request_due_soon`,
  `request_closed`, `customer_anonymized`.
