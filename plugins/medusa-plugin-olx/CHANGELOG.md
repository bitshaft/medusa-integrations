# Changelog

All notable changes to `@bitshaft/medusa-plugin-olx`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

First version. Built from OLX's Partner API specification and tested against a
simulated API; not yet run against a live OLX account.

- Connect an OLX account with OAuth 2.0. Tokens are encrypted in the database and
  refreshed automatically.
- One advert per variant, published by hand from the product page, or several
  at once with a shared category. OLX's text rules are checked before sending.
- Edit, take down and bring back adverts from the admin.
- Adverts come down when the item can no longer be bought in the store, on stock
  events and in a job every 5 minutes. Failed take-downs are repeated.
- "Sold on OLX" clears the variant's free stock and takes the advert down.
- No duplicates: a create whose answer was lost is matched by `external_id`
  before anything is sent again.
- Statuses follow OLX's change feed.
- Polish and English admin, a guide with installation steps, and a demo mode that
  needs no OLX account, with sample adverts in every status.
