# Changelog

All notable changes to `@bitshaft/medusa-plugin-stripe`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## [0.1.0] - 2026-11-20

First release.

- Read-only Stripe client: GET only, with an allow-list of paths; anything
  else throws before a request is sent. The key is used only in the
  Authorization header and masked everywhere.
- Reads on demand only, with a shared cache (`cacheSeconds`), one request
  for simultaneous admins, a 25-second budget per page and a 1000-item limit
  per list, both clearly marked when they cut data.
- Admin page "Stripe": overview (turnover, fees, net, refunds, success rate,
  disputes, balance, next payout, by method), payments with orders and
  payments without an order, payouts with their orders (CSV), open
  disputes with deadlines, configuration checks with fixes, and a guide.
- Order widget with the PaymentIntent behind the order.
- Demo mode with sample data and no requests to Stripe.
- Money as integer minor units, totals per currency; Polish and English.
