import type { MedusaContainer } from "@medusajs/framework/types"
import type { ComponentType } from "react"

import type { CopyGroup } from "./copy/types"
import type { EmailLocale } from "./locales"

/* ------------------------------------------------------------------------ */
/* Email types                                                               */
/* ------------------------------------------------------------------------ */

export type EmailAudience = "customer" | "account" | "team"

export type EmailTypeDefinition = {
  type: string
  audience: EmailAudience
  /**
   * The email carries a secret (reset token, verification code). Its data is
   * never stored, so it cannot be resent or retried later.
   */
  sensitive: boolean
  /** `{{variables}}` the copy of this type may use; `null` allows any. */
  variables: string[] | null
  /** Registered through plugin options, not shipped with the plugin. */
  custom: boolean
  /** State of the on/off toggle until an admin changes it. */
  defaultEnabled: boolean
}

const BASE_VARIABLES = ["store_name", "support_email", "first_name", "last_name", "customer_name", "customer_email"]
const ORDER_VARIABLES = [...BASE_VARIABLES, "order_number", "order_total", "order_date"]

function builtIn(
  type: string,
  audience: EmailAudience,
  variables: string[],
  extra: Partial<EmailTypeDefinition> = {}
): EmailTypeDefinition {
  return { type, audience, variables, sensitive: false, custom: false, defaultEnabled: true, ...extra }
}

export const BUILT_IN_TYPES: EmailTypeDefinition[] = [
  builtIn("order-confirmation", "customer", ORDER_VARIABLES),
  builtIn("payment-received", "customer", [...ORDER_VARIABLES, "amount"]),
  builtIn("order-fulfilled", "customer", ORDER_VARIABLES),
  builtIn("order-shipped", "customer", [...ORDER_VARIABLES, "tracking_number"]),
  builtIn("order-delivered", "customer", [...ORDER_VARIABLES, "tracking_number"]),
  builtIn("order-canceled", "customer", ORDER_VARIABLES),
  builtIn("refund-issued", "customer", [...ORDER_VARIABLES, "refund_amount"]),
  builtIn("return-requested", "customer", ORDER_VARIABLES),
  builtIn("return-accepted", "customer", ORDER_VARIABLES),
  builtIn("welcome", "account", BASE_VARIABLES),
  builtIn("email-verification", "account", [...BASE_VARIABLES, "code", "expires_at"], { sensitive: true }),
  builtIn("password-reset", "account", BASE_VARIABLES, { sensitive: true }),
  builtIn("team-new-order", "team", ORDER_VARIABLES),
  builtIn("team-low-stock", "team", ["store_name", "count", "threshold"]),
  builtIn("team-payment-failed", "team", [
    "store_name",
    "customer_email",
    "amount",
    "reason",
    "order_number",
    "order_total",
  ]),
]

/** Variables of the shared `common` group (they must work in every email). */
export const COMMON_VARIABLES = ["store_name", "support_email", "first_name", "expires_at"]

/* ------------------------------------------------------------------------ */
/* Template data                                                             */
/* ------------------------------------------------------------------------ */

export type OrderItemView = {
  title: string
  subtitle?: string | null
  sku?: string | null
  quantity: number
  unit_price: number
  total: number
  thumbnail?: string | null
}

/** An order reduced to what emails show. Amounts are in major units, as Medusa stores them. */
export type OrderView = {
  id: string
  display_id: string
  created_at: string | null
  email: string | null
  currency_code: string
  country_code: string | null
  customer: { id: string | null; first_name: string | null; last_name: string | null }
  items: OrderItemView[]
  /** Items before discounts. With shipping minus the discount it adds up to the total. */
  subtotal: number
  shipping_total: number
  discount_total: number
  tax_total: number
  total: number
  shipping_address: string[]
  billing_address: string[]
  shipping_methods: string[]
}

export type QuantityLine = { title: string; subtitle?: string | null; quantity: number }

/** Data a template receives. Built-in templates use the named fields; custom ones may add their own. */
export type EmailData = {
  order?: OrderView
  customer?: { first_name?: string | null; last_name?: string | null; email?: string | null }
  /** Where the main button leads (order page, tracking page, reset form, admin). */
  action_url?: string | null
  /**
   * Adds an "Unsubscribe" link to the footer and a `List-Unsubscribe` header,
   * for emails people signed up for (e.g. back-in-stock alerts).
   */
  unsubscribe_url?: string | null
  /**
   * The unsubscribe URL accepts a POST without further confirmation, so mail
   * clients may offer one-click unsubscribe (RFC 8058).
   */
  unsubscribe_one_click?: boolean
  payment?: { amount: number; currency_code: string }
  refund?: { amount: number; currency_code: string; note?: string | null }
  shipment?: { tracking: Array<{ number: string; url?: string | null }>; items: QuantityLine[] }
  return?: { items: QuantityLine[] }
  code?: string | null
  expires_at?: string | null
  low_stock?: {
    threshold: number
    items: Array<{ title: string; sku?: string | null; location?: string | null; available: number }>
  }
  failure?: {
    amount?: number | null
    currency_code?: string | null
    reason?: string | null
    customer_email?: string | null
    provider?: string | null
  }
  [key: string]: unknown
}

/* ------------------------------------------------------------------------ */
/* Templates                                                                 */
/* ------------------------------------------------------------------------ */

export type Brand = {
  name: string
  logoUrl?: string
  logoWidth: number
  colors: {
    primary: string
    primaryText: string
    background: string
    card: string
    text: string
    muted: string
    border: string
  }
  footerText?: string
  company?: { name?: string; address?: string; taxId?: string; phone?: string; email?: string }
  links: { website?: string; terms?: string; returns?: string; privacy?: string }
  supportEmail?: string
}

export type EmailFormatters = {
  /** `129.99`, `"pln"` → `129,99 zł`. */
  money: (amount: number | null | undefined, currencyCode: string | null | undefined) => string
  date: (value: string | Date | null | undefined) => string
  dateTime: (value: string | Date | null | undefined) => string
}

/** Props of every email template, built-in or custom. */
export type EmailTemplateProps<D extends EmailData = EmailData> = {
  data: D
  /** Text of this email type, already interpolated. */
  copy: CopyGroup
  /** Shared labels (table headers, footer links), already interpolated. */
  common: CopyGroup
  brand: Brand
  locale: EmailLocale
  format: EmailFormatters
  audience: EmailAudience
}

export type EmailTemplate = ComponentType<EmailTemplateProps>

/* ------------------------------------------------------------------------ */
/* Loading and sending                                                       */
/* ------------------------------------------------------------------------ */

export type EmailAttachment = {
  filename: string
  /** Base64 encoded file. */
  content: string
  content_type?: string
  disposition?: "attachment" | "inline"
  /** Content ID for inline images. */
  id?: string
}

/** What a loader turns the trigger's input into. */
export type LoadedEmail = {
  data: EmailData
  /** Recipient for customer and account emails. Team emails go to the configured recipients. */
  to?: string | null
  /** Language of the email; the store default when not set. */
  locale?: string | null
  order_id?: string | null
  customer_id?: string | null
  resource_type?: string | null
  resource_id?: string | null
  /** Replaces the trigger's dedupe key (e.g. once the refund ID is known). */
  dedupe_key?: string | null
  /** Set to skip the email, with the reason for the log. */
  skip?: string
}

export type EmailLoaderContext = {
  container: MedusaContainer
  /** Builds a URL from the `urls` option; undefined when it cannot be built. */
  url: (name: string, values?: Record<string, string | number | null | undefined>) => string | undefined
  /**
   * Picks the language among the store's: the one the caller asked for, else
   * the first candidate the store has (same code, else same language), else
   * the one mapped to the country, else the base. Always the base when
   * Medusa's Translation module is off.
   */
  locale: (candidates: unknown[], countryCode?: string | null) => EmailLocale
  /** The base language (or the one the caller asked for): store team emails use it. */
  defaultLocale: EmailLocale
}

export type EmailLoader = (input: Record<string, unknown>, context: EmailLoaderContext) => Promise<LoadedEmail>

/** Passed to the `attachments` option. */
export type AttachmentContext = {
  type: string
  locale: EmailLocale
  to: string
  data: EmailData
  input: Record<string, unknown>
  order_id: string | null
  customer_id: string | null
  container: MedusaContainer
}

export type AttachmentResolver = (
  context: AttachmentContext
) => EmailAttachment[] | null | undefined | Promise<EmailAttachment[] | null | undefined>

/** A template registered through the `templates` plugin option. */
export type CustomTemplateOption = {
  /** Replaces the built-in component, or renders a new email type. */
  component?: EmailTemplate
  /**
   * Default text per language (`en`, `pl`, or full codes like `de-DE`),
   * matched to the store's languages by code, else by language. Admins can
   * still edit it. Needs at least `subject` for a new type.
   */
  copy?: Partial<Record<EmailLocale, CopyGroup>>
  /** For new types. Default `customer`. */
  audience?: EmailAudience
  /** `{{variables}}` the copy may use, checked when admins edit it. Any by default. */
  variables?: string[]
  /** For new types whose input is not the template data itself. */
  loadData?: (input: Record<string, unknown>, context: EmailLoaderContext) => LoadedEmail | Promise<LoadedEmail>
  /** State of the on/off toggle until an admin changes it. Default on. */
  enabled?: boolean
  /** Example data for the admin preview and test sends of a new type; gets the store language code. */
  previewData?: EmailData | ((locale: EmailLocale) => EmailData)
}
