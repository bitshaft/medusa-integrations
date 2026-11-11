# Changelog

All notable changes to `@bitshaft/medusa-plugin-whitelist-vat`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

First release.

- Verification of Polish NIP numbers on the Ministry of Finance white list
  and, with a store's own key, in the GUS REGON register; EU VAT numbers in
  VIES. Format and check digits are validated before any register is asked.
- One verdict per tax ID with company data (name, address, REGON, KRS, bank
  accounts), cached for 24 hours.
- Register outages, timeouts and the white list's daily limit always give
  "could not verify", never "invalid", and never overwrite an earlier answer.
- Verification history with the registers' request IDs, linked to orders
  and customers; orders with a tax ID are verified when placed.
- Storefront route that returns the verdict and company data for invoice
  forms, rate limited per visitor.
- Optional rejection of carts with an invalid tax ID at completion.
- Admin page under Extensions (overview, lookup, bank account check,
  settings) and panels on order and customer pages, in Polish and English.
- `verify-whitelist-vat-tax-id` and `verify-whitelist-vat-order` workflows
  and the `whitelist-vat.tax_id.verified` event.
- Works without options; invalid options leave the plugin disabled with one
  log line instead of stopping Medusa.
