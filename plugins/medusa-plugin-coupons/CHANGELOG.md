# Changelog

All notable changes to `@bitshaft/medusa-plugin-coupons`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

First release.

### Security

- `POST /store/coupons/check` and `GET /store/coupons/progress` answer for
  a customer's cart only to that customer. Before, anyone with the cart id
  could learn the owner's coupon eligibility (groups, first order, earlier
  uses).

- Coupon panel under Extensions: cards, filters with counters, search, list
  with a one-sentence description, uses, discount, orders and revenue; edit,
  pause/resume, duplicate, open in Medusa promotions, delete; orders per
  coupon.
- Three-step wizard (kind, who for, rules) with a live preview, readiness per
  step and warnings before saving.
- One-sentence descriptions in Polish and English, used in the list, the
  wizard and the CSV export.
- Kinds: percentage, amount, free shipping, category, buy X get Y, tiers.
- Rules: code or automatic, dates, total limit, limit per customer (by
  customer, or e-mail for guests), first order only, groups or chosen
  customers, minimum gross basket, does not combine, exclusions of products,
  collections, categories and items on sale.
- Batches of unique single-use codes with a list of used codes and orders,
  CSV export, and the `bitshaft.coupons.batch_created` event.
- Store API: `POST /store/coupons/check` (reason in the customer's language)
  and `GET /store/coupons/progress` (next tier, free shipping).
- Every rule is checked on the server, through workflow hooks, when a code is
  added and before the order is placed. Discounts are always computed by the
  Promotion Module.
- CSV export of all coupons with their stats.
- Admin in English and Polish.
