<h1 align="center">Emails for Medusa</h1>

<p align="center">
  The emails every store needs, in Polish and English, ready on install: order, shipping, refund,
  return and account emails for customers, and alerts for the store team.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitshaft/medusa-plugin-emails"><img alt="npm" src="https://img.shields.io/npm/v/@bitshaft/medusa-plugin-emails"></a>
  <a href="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Medusa" src="https://img.shields.io/badge/medusa-%E2%89%A52.22-7c3aed">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#emails">Emails</a> ·
  <a href="#admin">Admin</a> ·
  <a href="#customizing">Customizing</a> ·
  <a href="#testing">Testing</a>
</p>

---

## Requirements

- Medusa **2.22** or newer, Node.js 20.19+ or 22.12+
- A [Resend](https://resend.com) account with a verified sending domain, or any SMTP server.
  Neither is needed to try the plugin in [demo mode](#demo-mode).

## Installation

```bash
npm install @bitshaft/medusa-plugin-emails
```

The package uses the Medusa packages your app already has (`@medusajs/framework`,
`@medusajs/medusa`, the admin SDK, UI and icons, `@medusajs/js-sdk`,
`@tanstack/react-query`, `react`, `react-dom` and `react-router-dom`) as peer
dependencies. Its own dependencies are `@react-email/components` for the
templates and `nodemailer` for SMTP.

Register it ([Configuration](#configuration)) and run the migrations:

```bash
npx medusa db:migrate
```

## Configuration

The plugin has two parts in `medusa-config.ts`: the **plugin** (templates,
triggers, send log, admin) and a **notification provider** that does the
sending. The plugin talks to Medusa's notification module, so the provider
is swappable: use the Resend or SMTP provider from this package, or any
other provider registered for the `email` channel.

```ts
import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  // ...
  plugins: [
    {
      resolve: "@bitshaft/medusa-plugin-emails",
      options: {
        from: "My Shop <orders@myshop.pl>",
        replyTo: "help@myshop.pl",
        defaultLocale: "pl",
        storefrontUrl: process.env.STOREFRONT_URL, // https://myshop.pl
        adminUrl: process.env.MEDUSA_ADMIN_URL, // https://api.myshop.pl/app
        brand: {
          logoUrl: "https://myshop.pl/logo.png",
          colors: { primary: "#0f766e" },
          company: { name: "My Shop sp. z o.o.", address: "ul. Lipowa 1, 00-001 Warszawa", taxId: "NIP 1234567890" },
          links: { terms: "https://myshop.pl/regulamin", returns: "https://myshop.pl/zwroty" },
        },
        team: { recipients: ["orders@myshop.pl"] },
      },
    },
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@bitshaft/medusa-plugin-emails/providers/resend",
            id: "resend",
            options: { channels: ["email"], apiKey: process.env.RESEND_API_KEY },
          },
        ],
      },
    },
  ],
})
```

For SMTP, register this provider instead (Medusa allows one provider per
channel, so pick one):

```ts
{
  resolve: "@bitshaft/medusa-plugin-emails/providers/smtp",
  id: "smtp",
  options: {
    channels: ["email"],
    host: process.env.SMTP_HOST,
    port: 587, // 465 with secure: true
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
  },
}
```

**Missing options never stop Medusa.** Without `from` (or with invalid
options) the plugin stays disabled and logs one line,
`[emails] Disabled: missing option from. …`; the settings page shows the
same reason. The providers behave the same way without `apiKey` or `host`.

### Environment variables

| Variable                                  |                                                             |
| ----------------------------------------- | ----------------------------------------------------------- |
| `RESEND_API_KEY`                          | Resend API key with sending access.                         |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | SMTP server, when you use the SMTP provider.                |
| `STOREFRONT_URL`                          | Public URL of the storefront, for links in customer emails. |
| `MEDUSA_ADMIN_URL`                        | URL of the admin, for "Open in admin" in store team emails. |

The names are yours to choose; the plugin only reads options. See
[`.env.template`](./.env.template).

### Plugin options

| Option                | Default        |                                                                                               |
| --------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `from`                | required       | Sender: `orders@shop.pl` or `Shop <orders@shop.pl>`.                                          |
| `replyTo`             |                | Reply-to address.                                                                             |
| `demo`                | `false`        | [Demo mode](#demo-mode): render and log, send nothing.                                        |
| `defaultLocale`       | `"en"`         | `"en"` or `"pl"`. Used when the customer's language is unknown, and for store team emails.    |
| `localeByCountry`     | `{ pl: "pl" }` | Language by shipping country, for orders without a locale.                                    |
| `storefrontUrl`       |                | Without it, buttons that lead to the store are hidden and password reset emails are not sent. |
| `adminUrl`            |                | Without it, store team emails have no "Open in admin" button.                                 |
| `urls`                | see below      | URL templates for the links in emails.                                                        |
| `brand`               |                | `name`, `logoUrl`, `logoWidth`, `colors`, `footerText`, `company`, `links`, `supportEmail`.   |
| `team.recipients`     | `[]`           | Who gets store team alerts until recipients are set in the admin.                             |
| `lowStock.threshold`  | `5`            | Low stock threshold until it is changed in the admin.                                         |
| `disabledTypes`       | `[]`           | Email types that start switched off, e.g. `["payment-received"]`.                             |
| `retries.maxAttempts` | `5`            | Attempts per email, including the first.                                                      |
| `channel`             | `"email"`      | Notification channel the emails are sent on.                                                  |
| `templates`           | `{}`           | [Replace templates or add your own email types](#your-own-templates).                         |
| `attachments`         |                | [Files to attach](#attachments), e.g. an invoice PDF.                                         |

`brand.name` defaults to the store's name in Medusa. `brand.colors` takes
`primary`, `primaryText`, `background`, `card`, `text`, `muted` and `border`
as hex colors. `brand.footerText` is one string or `{ en, pl }`.

**Links.** Each entry of `urls` is a template; placeholders in `{braces}`
are URL-encoded. The defaults match the Medusa Next.js starter where it has
a page:

| `urls` key           | Default                                                      | Placeholders                                                |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `order`              | `{storefrontUrl}/{country_code}/order/{order_id}/confirmed`  | `order_id`, `display_id`, `country_code`, `email`, `locale` |
| `store`              | `{storefrontUrl}`                                            | `locale`                                                    |
| `passwordReset`      | `{storefrontUrl}/reset-password?token={token}&email={email}` | `token`, `email`, `locale`                                  |
| `emailVerification`  | `{storefrontUrl}/verify-email?code={code}&email={email}`     | `code`, `email`, `locale`                                   |
| `adminOrder`         | `{adminUrl}/orders/{order_id}`                               | `order_id`                                                  |
| `adminInventory`     | `{adminUrl}/inventory`                                       |                                                             |
| `adminPasswordReset` | `{adminUrl}/reset-password?token={token}&email={email}`      | `token`, `email`                                            |

When a link cannot be built (for example `storefrontUrl` is not set), the
button is left out rather than pointing nowhere.

## Emails

| Email                | Type                  | Sent when                                                                 |
| -------------------- | --------------------- | ------------------------------------------------------------------------- |
| Order confirmation   | `order-confirmation`  | `order.placed`                                                            |
| Payment received     | `payment-received`    | `payment.captured`                                                        |
| Order fulfilled      | `order-fulfilled`     | `order.fulfillment_created`, when the order is packed |
| Order shipped        | `order-shipped`       | `shipment.created`, with tracking numbers and the carrier's tracking link |
| Order delivered      | `order-delivered`     | `delivery.created`                                                        |
| Order canceled       | `order-canceled`      | `order.canceled`                                                          |
| Refund issued        | `refund-issued`       | `payment.refunded` (one email per refund)                                 |
| Return requested     | `return-requested`    | `order.return_requested`                                                  |
| Return accepted      | `return-accepted`     | `order.return_received`                                                   |
| Welcome              | `welcome`             | `customer.created`, for customers with an account (not checkout guests)   |
| Email verification   | `email-verification`  | `auth.verification_requested`                                             |
| Password reset       | `password-reset`      | `auth.password_reset` (customers and admin users)                         |
| New order alert      | `team-new-order`      | `order.placed`, to the store team                                         |
| Low stock alert      | `team-low-stock`      | A scheduled check, to the store team                                      |
| Failed payment alert | `team-payment-failed` | `emails.payment.failed`, to the store team                                |

**Language.** Customer emails use, in order: the order's `locale`,
`order.metadata.locale`, `customer.metadata.locale`, the language mapped to
the shipping country (`localeByCountry`), then `defaultLocale`. Store team
emails use `defaultLocale`.

**Notifications turned off.** Fulfillments and returns created with "send
notification" unchecked in the admin do not send emails.

### Email verification

Medusa 2.22 has its own verification flow: `POST /auth/verification/request`
creates a code and emits `auth.verification_requested`, and
`POST /auth/verification/confirm` checks it. The plugin sends the code (and
a link built from `urls.emailVerification`) when that event carries an
email address. You need an auth verification provider configured in Medusa
and a storefront page that calls the confirm route; see Medusa's auth
documentation. The plugin does not create codes or mark anything as
verified itself.

### Low stock alerts

Every 30 minutes the plugin compares each inventory level (stocked minus
reserved) with the threshold from Settings → Emails. New shortages are sent
as one email; an item is reported once and again only after it has been
restocked above the threshold.

### Failed payment alerts

Medusa has no event for a failed payment, so the plugin listens to its own.
Emit it from a payment integration's webhook handler or from your code:

```ts
import { EmailsEvents } from "@bitshaft/medusa-plugin-emails/workflows"
import { Modules } from "@medusajs/framework/utils"

await container.resolve(Modules.EVENT_BUS).emit({
  name: EmailsEvents.PAYMENT_FAILED, // "emails.payment.failed"
  data: {
    payment_id: "pay_123", // optional; alerts are deduplicated by it
    order_id: "order_123", // optional
    amount: 129.99, // major units
    currency_code: "pln",
    reason: "Card declined",
    customer_email: "anna@example.com",
  },
})
```

## How it works

- **Sent once per event.** Before an email goes out, a row with a dedupe key
  (`order-confirmation:<order id>`) is written to the send log; a unique
  index rejects the second one. Events that Medusa delivers twice send one
  email.
- **Retries.** When the provider fails, the email is retried after 1, 5, 30
  and 120 minutes (`retries.maxAttempts` in total) by a job that runs every
  two minutes. With Resend every attempt carries the same idempotency key,
  so a retry can never deliver twice. With SMTP, a failure where the server
  may already have taken the message (a timeout during transfer) is _not_
  retried automatically; the log says so and you can resend by hand.
- **Secrets.** Password reset tokens and verification codes are put into
  the email and nowhere else: not in the send log, not in workflow
  executions, not in log lines. Those emails are retried only immediately
  and cannot be resent. Email addresses are masked in log lines.
- **What is stored.** The send log keeps the recipient, subject, status,
  error and the small input needed to render the email again (IDs), not the
  rendered email.

### Demo mode

```ts
options: { from: "My Shop <orders@myshop.pl>", demo: true }
```

Every email is rendered and written to the send log with the status `demo`,
and a log line says what would have been sent. Nothing reaches the
notification module, so no provider is needed. Previews, test sends and
resends work the same way.

## Admin

**Settings → Emails**

- Every email type with an on/off toggle, grouped into orders, customer
  account and store team.
- Store team recipients and the low stock threshold, with a way back to the
  defaults from the plugin options. Each alert can have its own recipients.
- **Editor** per email: the text in Polish and English (subject, preview
  text, heading, body, button, note), the `{{variables}}` it may use, and a
  **live preview** rendered with a real order from the store. Unsaved edits
  show in the preview as you type. "Shared texts" holds the greeting,
  sign-off, table labels and footer of every email.
- **Send a test** of any email to any address.
- **Restore defaults**, guarded: per email you type the email's name to
  confirm; "Reset everything" asks you to type `RESET`. The send log is
  never reset.
- **Send log** with search by recipient and a status filter.

**Order and customer pages** get a panel with the emails sent for that
record and a **Resend** button. A resend is a new email with the order's
current data, sent to the same address.

The admin is in English and Polish.

## Customizing

### Text

Edit it in the admin. Text is plain (no HTML); a blank line starts a new
paragraph. Variables such as `{{order_number}}` or `{{first_name}}` are
listed in the editor per email, and unknown ones are rejected on save.

### Attachments

Give the plugin a resolver and it attaches what the resolver returns, for
example an invoice from an invoicing plugin or a return label:

```ts
options: {
  attachments: {
    "order-confirmation": async ({ order_id, container, locale }) => {
      const pdf = await container.resolve("invoices").getPdf(order_id) // Buffer
      return [{ filename: `invoice-${order_id}.pdf`, content: pdf.toString("base64"), content_type: "application/pdf" }]
    },
  },
}
```

`attachments` is one function for every email or an object keyed by email
type. The resolver runs on every attempt, including retries and resends. If
it throws, the email is sent without the files and a warning is logged.
Up to 10 files per email.

### Your own templates

Templates are [React Email](https://react.email) components. Replace a
built-in one, or register a new email type with its own text:

```tsx
// src/emails/abandoned-cart.tsx
import { StandardEmail, type EmailTemplateProps } from "@bitshaft/medusa-plugin-emails/templates"
import { Text } from "@react-email/components"

export const AbandonedCart = (props: EmailTemplateProps) => (
  <StandardEmail {...props}>
    <Text>{String(props.data.count)} × 🛒</Text>
  </StandardEmail>
)
```

```ts
// medusa-config.ts
options: {
  templates: {
    "abandoned-cart": {
      component: AbandonedCart,
      copy: {
        en: { subject: "You left {{count}} items behind", heading: "Still thinking?", body: "Your cart is waiting.", button: "Back to the cart" },
        pl: { subject: "W koszyku czeka {{count}} produktów", heading: "Jeszcze się zastanawiasz?", body: "Twój koszyk czeka.", button: "Wróć do koszyka" },
      },
      previewData: { count: 3, action_url: "https://myshop.pl/cart" },
    },
    // Replace only the look of a built-in email; its text and data stay.
    "order-confirmation": { component: MyOrderConfirmation },
  },
}
```

A custom type shows up in the admin with a toggle, editable text, preview
and test send. `StandardEmail` renders the heading, greeting, body, button
(when the data has `action_url`), note and sign-off around your content;
the package also exports `EmailLayout`, `OrderSummary`, `OrderItems`,
`OrderTotals`, `InfoRows`, `QuantityList`, `Highlight` and `PrimaryButton`.

### Workflows and events

Send any registered email type from your code through the same pipeline
(toggle, language, branding, edited text, send log, retries, demo mode):

```ts
import { sendEmailsMessageWorkflow } from "@bitshaft/medusa-plugin-emails/workflows"

const { result } = await sendEmailsMessageWorkflow(container).run({
  input: {
    type: "abandoned-cart",
    to: cart.email,
    locale: "pl",
    data: { count: cart.items.length, action_url: `https://myshop.pl/cart/${cart.id}` },
    dedupeKey: `abandoned-cart:${cart.id}`, // at most one email per key
  },
})
// result.status: "sent" | "demo" | "duplicate" | "skipped" | "failed"
```

`data` must be plain JSON: it is stored so the email can be retried and
resent. Pass `sensitive: true` when it holds a secret, and it will not be
stored. `resendEmailsMessageWorkflow` resends an email from the log by ID.

For emails people signed up for, put `unsubscribe_url` in `data`: the
footer then shows an "Unsubscribe" link and the email gets a
`List-Unsubscribe` header (passed on by the Resend and SMTP providers). Add
`unsubscribe_one_click: true` when that URL unsubscribes on a POST without
further confirmation, for mail clients' one-click unsubscribe (RFC 8058).
The [back-in-stock plugin](../medusa-plugin-back-in-stock/README.md) uses this.

The plugin emits `emails.message.sent` and `emails.message.failed` with
`{ id, type, recipient, order_id, customer_id }`, and listens to
`emails.payment.failed` ([above](#failed-payment-alerts)).

## What it does not do

- No marketing emails, newsletters or unsubscribe handling.
- No abandoned cart emails out of the box (add one as a
  [custom type](#your-own-templates)).
- No HTML or drag-and-drop editing in the admin: admins edit text; the
  layout is code.
- No languages other than English and Polish in the built-in text. Custom
  templates can carry their own, but the admin editor shows these two.
- No delivery tracking (opens, bounces). The send log records what was
  handed to the provider.
- It does not create verification codes; see
  [Email verification](#email-verification).

## API

Admin routes, all under `/admin/emails` and behind admin authentication:

| Route                       |                                                               |
| --------------------------- | ------------------------------------------------------------- |
| `GET /status`               | Enabled or the reason it is not, demo mode, sender.           |
| `GET, POST /settings`       | Store team recipients and low stock threshold.                |
| `GET /types`                | Email types with their toggles.                               |
| `GET, POST /types/:type`    | One type: toggle, recipients, text. `:type` may be `common`.  |
| `POST /types/:type/preview` | Render with a real order; nothing is sent.                    |
| `POST /types/:type/test`    | Send a test to `{ to }`.                                      |
| `POST /types/:type/reset`   | Restore defaults; needs `{ confirm: "<type>" }`.              |
| `POST /reset`               | Restore all settings; needs `{ confirm: "RESET" }`.           |
| `GET /messages`             | Send log; filter by `order_id`, `customer_id`, `status`, `q`. |
| `POST /messages/:id/resend` | Resend an email from the log.                                 |

## Testing

1. **Demo mode first.** Set `demo: true`, place an order, and look at
   Settings → Emails → Send log and at the previews.
2. **Resend.** Create an API key at resend.com → API Keys and verify your
   domain (Domains). Until the domain is verified you can send from
   `onboarding@resend.dev` to your own account address only. Set `from` to
   an address on the verified domain, register the Resend provider and use
   **Send a test** in the editor of any email.
3. **SMTP.** Any server works; for local testing a catcher such as Mailpit
   (`host: "localhost", port: 1025, requireTls: false`) shows the emails
   without sending them.

## Troubleshooting

- **`[emails] Disabled: …` at startup:** the plugin options are missing or
  invalid; the message names the option.
- **Emails show as failed with "Could not find a notification provider for
  channel: email":** no provider is registered for the channel in the
  notification module's options.
- **Resend answers 403:** the `from` domain is not verified in Resend, or
  the API key has no sending access.
- **No password reset email:** `storefrontUrl` (or `adminUrl` for admin
  users) is not set; the settings page says so.
- **Store team alerts are not sent:** no recipients are set; the list shows
  a "No recipients" badge.
- **Wrong language:** see how the [language](#emails) is picked; set
  `localeByCountry` or store the locale on the order or customer.

## Development

See [docs/development.md](./docs/development.md) and the repository's
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 [Bitshaft](https://bitshaft.pl). Resend is a
trademark of its owner; this plugin is not affiliated with or endorsed by
Resend. See [TRADEMARKS.md](../../TRADEMARKS.md).
