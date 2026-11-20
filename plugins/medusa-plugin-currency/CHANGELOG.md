# Changelog

All notable changes to `@bitshaft/medusa-plugin-currency`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## [0.1.0] - 2026-11-20

First release.

- "Fill prices" from the base currency into the store's other currencies, from
  a product page (all variants), a collection or category page, or the
  Currencies page (chosen products, a whole collection or category).
- Per currency: fixed rate, NBP rate 1:1 or NBP rate ± margin; rounding to the
  minor unit, whole units, ,99, ,49/,99, full 5 or full 10; VAT gross 1:1 or
  through net with a chosen country.
- NBP table A with table number and date, cached until the next table is due,
  cross rates for a base other than PLN, and the last saved table (marked with
  its date) when NBP does not answer. Rate sources are swappable providers.
- A preview of every price before saving; only empty prices by default,
  overwriting confirmed separately; price lists and region prices optional.
  The save writes exactly the preview and is refused (409) when a base price
  or a rate changed since.
- "Suggest prices" in Medusa's own price editors (product, variant, new product, new
  variant): a price typed in any column fills the row's other columns under the same
  rules, as if typed, until the admin saves. `POST /admin/currency/suggest`.
- History of every fill, and the origin of each price (manual, or filled on a
  day at a rate).
- `currency.prices_filled` event for other plugins.
- Demo mode: sample rates and products, no NBP calls, no price writes.
- Admin in Polish and English.
