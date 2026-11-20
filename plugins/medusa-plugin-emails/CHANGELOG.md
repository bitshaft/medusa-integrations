# Changelog

All notable changes to `@bitshaft/medusa-plugin-emails`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org).

## [0.1.0] - 2026-11-20

First release.

- Admin page with tabs: History (first), Templates, Appearance, Settings
  and a Rollout guide with the steps' status detected from the store.
- Appearance tab: colour palettes, every colour, font, button and card
  shapes, header alignment and logo, with a live preview; stored over
  `brand` from the options (new `brand.style` option).
- Variables in the text editor show as clickable chips with readable names.

- Fourteen emails in Polish and English: order confirmation, payment
  received, order shipped (with tracking), delivered, canceled, refund
  issued, return requested and accepted; welcome, email verification and
  password reset; store team alerts for new orders, low stock and failed
  payments.
- React Email templates with branding from plugin options, the language
  picked from the customer's locale, and your own templates and email types.
- Languages follow Medusa's Translation module: without it every email is in
  `defaultLocale`; with it every store language can be translated in the
  admin (a language select with missing counts), untranslated fields fall
  back to the original language, and `defaultLocale` takes any BCP 47 code.
  A card in Settings → Translations points to the editor.
- Resend and SMTP notification providers; any other provider for the
  `email` channel works too.
- Each email is sent once per event, logged, and retried on provider errors
  without risking duplicates. Tokens and codes are never stored.
- Attachments from a resolver option or the workflow input.
- Admin: on/off toggle per email, editable text with a guarded reset to
  defaults, live preview with a real order, test sends, store team
  recipients and low stock threshold, and a send log per order and customer
  with resend.
- Demo mode that renders and logs emails without sending, with "Restore test
  data": a month of sample send history over the store's orders and
  customers, in every type and status.
- `send-emails-message` and `resend-emails-message` workflows and
  `emails.*` events.
- An "Unsubscribe" footer link and `List-Unsubscribe` headers for emails whose
  data has an `unsubscribe_url` (used by the back-in-stock plugin).
- Missing or invalid options leave the plugin disabled with one log line
  instead of stopping Medusa.
