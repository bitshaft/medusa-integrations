# Changelog

All notable changes to `@bitshaft/medusa-plugin-loyalty`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

First release.

- Immutable points ledger: every balance change is an entry with a type,
  points, links, description and actor; the database refuses edits and
  deletes; every write is idempotent; balance changes lock the account.
- Points for paid orders (rate, gross or net base, tier multiplier, rounded
  down), first-order bonus, sign-up, birthday and newsletter actions.
- Returns take back the points of returned units by value; cancellations
  take back everything; negative balances block redemptions.
- Rewards: one-off customer-only codes (amount, percentage, free shipping)
  through the Promotion Module, and free gifts added to the cart at 0 with
  stock checks; removed gifts and expired codes give points back.
- Tiers by spend in a window, with multipliers and one-off bonuses,
  recalculated after orders, returns and daily.
- Expiry after inactivity with a reminder event.
- Store API for balance, history, rewards, redemption, estimates, terms and
  birthday; bilingual refusals.
- Admin page (panel, rewards, customers with ledger and CSV, settings with a
  customer preview, guide) and a customer widget, in Polish and English.
- Events: `loyalty.points_earned`, `points_redeemed`, `points_reverted`,
  `points_expiring`, `points_expired`, `tier_changed`, `reward_redeemed`.
