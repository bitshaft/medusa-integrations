import { MedusaError } from "@medusajs/framework/utils"

import type { Locale } from "./types"

/** Why a loyalty request was refused. Each reason has a message for the customer in both languages. */
export const REASONS = {
  program_disabled: {
    pl: "Program lojalnościowy jest chwilowo wyłączony.",
    en: "The loyalty program is switched off at the moment.",
  },
  not_signed_in: {
    pl: "Zaloguj się, aby zbierać i wymieniać punkty.",
    en: "Sign in to collect and redeem points.",
  },
  excluded: {
    pl: "Twoje konto nie bierze udziału w programie lojalnościowym.",
    en: "Your account does not take part in the loyalty program.",
  },
  reward_not_found: { pl: "Nie ma takiej nagrody.", en: "This reward does not exist." },
  reward_inactive: { pl: "Ta nagroda jest teraz niedostępna.", en: "This reward is not available at the moment." },
  insufficient_points: {
    pl: "Masz za mało punktów na tę nagrodę: potrzeba {{cost}}, masz {{balance}}.",
    en: "You do not have enough points for this reward: it needs {{cost}}, you have {{balance}}.",
  },
  negative_balance: {
    pl: "Saldo punktów jest ujemne po zwrocie. Kolejne zakupy je wyrównają, a potem możesz wymieniać nagrody.",
    en: "Your points balance is negative after a return. Your next orders will even it out; then you can redeem rewards.",
  },
  tier_too_low: {
    pl: "Ta nagroda jest dostępna od poziomu {{tier}}.",
    en: "This reward is available from the {{tier}} tier.",
  },
  limit_reached: {
    pl: "Wymieniono już tę nagrodę maksymalną liczbę razy.",
    en: "You have already redeemed this reward the maximum number of times.",
  },
  cart_required: {
    pl: "Gratis trafia do koszyka: podaj koszyk, do którego go dodać.",
    en: "A gift goes into a cart: send the cart to add it to.",
  },
  cart_not_found: { pl: "Nie znaleziono koszyka.", en: "The cart was not found." },
  cart_not_yours: {
    pl: "Ten koszyk nie należy do Twojego konta. Zaloguj się w koszyku i spróbuj ponownie.",
    en: "This cart does not belong to your account. Sign in on the cart and try again.",
  },
  cart_completed: { pl: "Ten koszyk jest już zamówieniem.", en: "This cart has already become an order." },
  out_of_stock: {
    pl: "Gratisu nie ma teraz w magazynie. Punkty nie zostały pobrane.",
    en: "The gift is out of stock right now. No points were taken.",
  },
  birthday_invalid: {
    pl: "Podaj datę urodzin w formacie RRRR-MM-DD.",
    en: "Send the birthday as YYYY-MM-DD.",
  },
  birthday_locked: {
    pl: "Datę urodzin można zmienić ponownie od {{date}}.",
    en: "The birthday can be changed again from {{date}}.",
  },
  reward_gift_quantity: {
    pl: "Gratis z programu lojalnościowego zawsze ma ilość 1.",
    en: "A loyalty gift always has a quantity of 1.",
  },
  reward_gift_locked: {
    pl: "Gratisu z programu lojalnościowego nie można zmieniać. Możesz go usunąć z koszyka.",
    en: "A loyalty gift cannot be changed. You can remove it from the cart.",
  },
  reward_gift_invalid: {
    pl: "Gratis z programu lojalnościowego w koszyku jest nieważny. Usuń go z koszyka i wymień nagrodę ponownie.",
    en: "The loyalty gift in the cart is no longer valid. Remove it from the cart and redeem the reward again.",
  },
  reserved_metadata: {
    pl: 'Klucze metadanych zaczynające się od "loyalty_" są zarezerwowane dla programu lojalnościowego. Usuń je z żądania.',
    en: 'Metadata keys starting with "loyalty_" are reserved for the loyalty program. Remove them from the request.',
  },
} as const

export type Reason = keyof typeof REASONS

export function reasonMessage(reason: Reason, locale: Locale, vars: Record<string, string | number> = {}): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    REASONS[reason][locale] as string
  )
}

/** A refusal the customer reads: reason code plus Polish and English text. */
export class LoyaltyError extends MedusaError {
  constructor(
    readonly reason: Reason,
    readonly vars: Record<string, string | number> = {}
  ) {
    super(
      reason === "reward_not_found" || reason === "cart_not_found"
        ? MedusaError.Types.NOT_FOUND
        : MedusaError.Types.NOT_ALLOWED,
      `${reasonMessage(reason, "pl", vars)} / ${reasonMessage(reason, "en", vars)}`,
      reason
    )
  }

  messages() {
    return { pl: reasonMessage(this.reason, "pl", this.vars), en: reasonMessage(this.reason, "en", this.vars) }
  }
}
