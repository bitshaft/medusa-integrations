# Changelog

All notable changes to `@bitshaft/medusa-plugin-negotiations`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

First release.

- Price negotiation threads for a product, a variant or a whole cart, with
  lines and catalog prices frozen when sent, numbered `NEG-YYYY-0001`.
- An explicit state machine (open, countered, accepted, rejected, expired,
  withdrawn); every move is one conditional update on status and version,
  so nothing is closed twice; acceptance carries the price that was seen.
- Append-only messages: replies, target prices, counter-offers with their
  own deadline, acceptances, rejections with a reason, internal notes that
  never reach the Store API or customer events.
- Whole-cart counter-offers as one amount (spread in whole grosze, never
  above the typed amount) or a price per line; allowed modes in the admin
  settings.
- Minimum price per variant and currency, and a maximum discount, with a
  warning and a required confirmation.
- Expiry after `expiryDays` without a move, counter-offer deadlines, an
  hourly job and "Expire inactive now".
- Writers after acceptance, off by default and armed by a person: a draft
  order (plan, dry run, write, exactly once) and the agreed lines in the
  customer's cart (exactly once at a time), with a history; cart guards on
  the Store API.
- Store API and Admin API, nine `negotiation.*` events with a fixed payload
  and a customer-safe part, customer group and rate limits.
- Admin page "Negotiations" (dashboard, thread page, rollout guide,
  settings), widgets on products, variants, customers and the order list,
  demo mode; Polish and English.
