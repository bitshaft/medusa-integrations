/**
 * Templates for @bitshaft/medusa-plugin-emails. Spread them into that
 * plugin's `templates` option and back-in-stock emails go through it: the
 * text becomes editable in its admin, sends appear in its send log, and its
 * branding and demo mode apply.
 *
 * ```ts
 * import { backInStockEmailTemplate } from "@bitshaft/medusa-plugin-back-in-stock/emails"
 *
 * { resolve: "@bitshaft/medusa-plugin-emails", options: { from: "…", templates: { ...backInStockEmailTemplate } } }
 * ```
 *
 * This file imports nothing from the emails plugin: the objects follow its
 * documented `templates` option, so neither package depends on the other.
 */
import { COPY } from "./copy"
import { languageOf, LOCALES, type Locale } from "./options"

export const EMAILS_RESTOCK_TYPE = "back-in-stock"
export const EMAILS_CONFIRM_TYPE = "back-in-stock-confirm"

const VARIABLES = ["store_name", "support_email", "customer_email", "product_label", "product_title", "variant_title"]

const copyFor = (kind: "restock" | "confirm") =>
  Object.fromEntries(LOCALES.map((locale) => [locale, { ...COPY[locale][kind] }])) as unknown as Record<
    Locale,
    Record<string, string>
  >

/** Example data for the admin preview; the emails plugin passes a store language code (`pl-PL`). */
const preview = (locale: string, kind: "restock" | "confirm") => ({
  product_title: languageOf(locale) === "pl" ? "Bluza z kapturem" : "Hooded sweatshirt",
  variant_title: "M",
  product_label: languageOf(locale) === "pl" ? "Bluza z kapturem · M" : "Hooded sweatshirt · M",
  action_url: kind === "restock" ? "https://example.com/products/hoodie" : "https://example.com/confirm",
  unsubscribe_url: "https://example.com/unsubscribe",
})

/** The plugin's name in the emails admin, next to each of its emails. */
const SOURCE = { en: "Back in stock", pl: "Alert dostępności" }

export const backInStockEmailTemplate = {
  [EMAILS_RESTOCK_TYPE]: {
    name: { en: "Back in stock", pl: "Produkt znów dostępny" },
    description: {
      en: "To everyone waiting, when a sold-out variant can be ordered again.",
      pl: "Do wszystkich czekających, gdy wyprzedany wariant znów da się zamówić.",
    },
    source: SOURCE,
    audience: "customer" as const,
    copy: copyFor("restock"),
    variables: VARIABLES,
    previewData: (locale: string) => preview(locale, "restock"),
  },
  [EMAILS_CONFIRM_TYPE]: {
    name: { en: "Confirm back-in-stock alert", pl: "Potwierdzenie zapisu na alert" },
    description: {
      en: "Right after signing up, when double opt-in is on: a link that confirms the address.",
      pl: "Zaraz po zapisie, gdy włączone jest potwierdzenie e-mailem: link potwierdzający adres.",
    },
    source: SOURCE,
    audience: "customer" as const,
    copy: copyFor("confirm"),
    variables: VARIABLES,
    previewData: (locale: string) => preview(locale, "confirm"),
  },
}
