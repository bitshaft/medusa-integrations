import type { Copy } from "./types"

/** Default English copy. `{{variables}}` are replaced when the text is used. */
export const en: Copy = {
  consent:
    "We will email you when this product is back in stock, every time it returns, until you buy it or unsubscribe. " +
    "Your address is used only for these notifications and never for marketing.",
  restock: {
    subject: "{{product_label}} is back in stock",
    preview: "The product you asked about is available again.",
    heading: "It's back in stock",
    body: "Good news: {{product_label}} is available again at {{store_name}}. Stock can run out quickly, so don't wait too long.",
    button: "View product",
    footnote:
      "You get this email because you asked to be notified when this product is back in stock. " +
      "We will tell you each time it returns, until you buy it or unsubscribe.",
  },
  confirm: {
    subject: "Confirm your back-in-stock alert",
    preview: "One click and we'll tell you when it's back.",
    heading: "Confirm your alert",
    body: "You asked to be notified when {{product_label}} is back in stock at {{store_name}}. Confirm with the button below.",
    button: "Confirm",
    footnote: "If you didn't ask for this, ignore this email and nothing will be sent.",
  },
  footer: {
    unsubscribe: "Unsubscribe",
    reason: "Sent by {{store_name}}.",
  },
  pages: {
    confirmTitle: "Confirm your back-in-stock alert",
    confirmText: "Confirm that you want an email when {{product_label}} is back in stock.",
    confirmButton: "Confirm",
    confirmedTitle: "Alert confirmed",
    confirmedText: "We will email you when {{product_label}} is back in stock.",
    unsubscribeTitle: "Unsubscribe from back-in-stock alerts",
    unsubscribeText: "Stop the emails about {{product_label}}?",
    unsubscribeButton: "Unsubscribe",
    unsubscribedTitle: "You are unsubscribed",
    unsubscribedText: "You will not get any more emails about {{product_label}}.",
    invalidTitle: "This link is no longer valid",
    invalidText: "It may have been used already, or the alert has ended.",
  },
}
