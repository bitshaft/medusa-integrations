import { MedusaError } from "@medusajs/framework/utils"

export type Locale = "pl" | "en"

/**
 * Why a request was refused, in Polish and English. Store routes answer in
 * the customer's language with both texts and a machine-readable `code`;
 * admin routes answer in English (the admin translates codes itself).
 */
export const REASONS = {
  disabled: {
    pl: "Negocjacje cen są chwilowo wyłączone.",
    en: "Price negotiations are switched off at the moment.",
  },
  not_signed_in: { pl: "Zaloguj się, aby negocjować cenę.", en: "Sign in to negotiate a price." },
  group_not_allowed: {
    pl: "Negocjacje cen są dostępne tylko dla wybranych klientów firmowych. Skontaktuj się ze sklepem.",
    en: "Price negotiations are available to selected business customers only. Contact the store.",
  },
  invalid_input: { pl: "Sprawdź dane: {{details}}", en: "Check the data: {{details}}" },
  not_found: { pl: "Nie znaleziono negocjacji.", en: "The negotiation was not found." },
  variant_not_found: { pl: "Nie znaleziono tego wariantu produktu.", en: "That product variant was not found." },
  product_has_variants: {
    pl: "Ten produkt ma kilka wariantów. Wybierz wariant (variant_id).",
    en: "This product has several variants. Choose one (variant_id).",
  },
  cart_not_found: { pl: "Nie znaleziono koszyka.", en: "The cart was not found." },
  cart_not_yours: { pl: "To nie jest Twój koszyk.", en: "This is not your cart." },
  cart_empty: { pl: "Koszyk jest pusty.", en: "The cart is empty." },
  cart_completed: {
    pl: "Ten koszyk jest już zamknięty. Użyj nowego koszyka.",
    en: "This cart is already completed. Use a new cart.",
  },
  cart_has_negotiated_lines: {
    pl: "Koszyk zawiera już pozycje z wynegocjowaną ceną. Usuń je, aby negocjować cały koszyk.",
    en: "The cart already holds lines with a negotiated price. Remove them to negotiate the whole cart.",
  },
  price_required: { pl: "Podaj cenę większą od zera.", en: "Send a price above zero." },
  price_unavailable: {
    pl: "Ten produkt nie ma ceny w walucie {{currency}}. Wybierz inny region lub walutę.",
    en: "This product has no price in {{currency}}. Choose another region or currency.",
  },
  currency_mismatch: {
    pl: "Waluta koszyka ({{cart}}) różni się od waluty negocjacji ({{thread}}).",
    en: "The cart's currency ({{cart}}) differs from the negotiation's currency ({{thread}}).",
  },
  quantity_too_large: {
    pl: "Maksymalna ilość w jednej pozycji to {{max}}.",
    en: "The largest quantity of one line is {{max}}.",
  },
  message_too_long: {
    pl: "Wiadomość może mieć najwyżej {{max}} znaków.",
    en: "A message can have at most {{max}} characters.",
  },
  message_required: { pl: "Napisz wiadomość albo podaj cenę.", en: "Write a message or send a price." },
  limit_open_threads: {
    pl: "Masz już {{max}} otwartych negocjacji. Zakończ którąś, zanim zaczniesz nową.",
    en: "You already have {{max}} open negotiations. Close one before you start another.",
  },
  limit_threads_per_hour: {
    pl: "W ciągu godziny można zacząć najwyżej {{max}} negocjacji. Spróbuj później.",
    en: "You can start at most {{max}} negotiations per hour. Try again later.",
  },
  limit_messages_per_hour: {
    pl: "W ciągu godziny można wysłać najwyżej {{max}} wiadomości. Spróbuj później.",
    en: "You can send at most {{max}} messages per hour. Try again later.",
  },
  conflict: {
    pl: "W międzyczasie negocjacja się zmieniła. Sprawdź aktualny stan i spróbuj ponownie.",
    en: "The negotiation changed in the meantime. Check its current state and try again.",
  },
  price_changed: {
    pl: "Cena w negocjacji zmieniła się w międzyczasie i nie została zaakceptowana. Sprawdź aktualną ofertę.",
    en: "The price changed in the meantime and was not accepted. Check the current offer.",
  },
  move_not_allowed: {
    pl: "Tego nie można zrobić, gdy negocjacja ma status „{{status}}”.",
    en: "This cannot be done while the negotiation is {{status}}.",
  },
  not_your_turn: { pl: "Czekamy na odpowiedź drugiej strony.", en: "Waiting for the other side to answer." },
  nothing_to_accept: { pl: "Nie ma oferty do zaakceptowania.", en: "There is no offer to accept." },
  customer_accept_off: {
    pl: "Ofertę zatwierdza sklep. Napisz, że ją przyjmujesz, a zespół ją potwierdzi.",
    en: "The store confirms offers. Write that you accept it and the team will confirm.",
  },
  mode_not_allowed: {
    pl: "Ten sposób podania ceny ({{mode}}) nie jest dozwolony.",
    en: "This way of pricing ({{mode}}) is not allowed.",
  },
  lines_mismatch: {
    pl: "Podaj cenę dla każdej pozycji negocjacji, dokładnie raz.",
    en: "Send a price for every line of the negotiation, exactly once.",
  },
  offer_expired: {
    pl: "Termin wynegocjowanej ceny minął {{date}}.",
    en: "The negotiated price expired on {{date}}.",
  },
  deadline_past: { pl: "Termin oferty musi być w przyszłości.", en: "The offer deadline must be in the future." },
  deadline_too_far: {
    pl: "Termin oferty może być najwyżej rok od dziś.",
    en: "The offer deadline can be at most a year from today.",
  },
  below_floor: {
    pl: "Cena jest poniżej ceny minimalnej lub dozwolonego rabatu. Potwierdź ją, aby kontynuować.",
    en: "The price is below the minimum price or the allowed discount. Confirm it to continue.",
  },
  writer_off: {
    pl: "Ta funkcja jest wyłączona w konfiguracji sklepu.",
    en: "This feature is switched off in the store's configuration.",
  },
  writer_not_armed: {
    pl: "Ta funkcja nie została jeszcze włączona w ustawieniach sklepu.",
    en: "This feature has not been switched on in the store's settings yet.",
  },
  demo_thread: {
    pl: "To negocjacja pokazowa: niczego nie zapisuje.",
    en: "This is a demo negotiation: it writes nothing.",
  },
  not_accepted: {
    pl: "Cena nie została jeszcze uzgodniona.",
    en: "The price has not been agreed yet.",
  },
  already_in_cart: {
    pl: "Uzgodnione pozycje są już w koszyku.",
    en: "The agreed lines are already in a cart.",
  },
  already_ordered: {
    pl: "Z tej oferty złożono już zamówienie.",
    en: "An order has already been placed from this offer.",
  },
  write_in_progress: {
    pl: "To samo jest właśnie zapisywane. Odśwież za chwilę.",
    en: "The same write is in progress. Reload in a moment.",
  },
  negotiated_line_locked: {
    pl: "Pozycji z wynegocjowaną ceną nie można zmieniać (ani ilości, ani metadanych). Usuń pozycję albo poproś o nową ofertę.",
    en: "A line with a negotiated price cannot be changed (neither its quantity nor its metadata). Remove the line or ask for a new offer.",
  },
  negotiated_line_invalid: {
    pl: "Pozycje z negocjacji {{number}} nie zgadzają się z uzgodnioną ofertą: {{reason}}. Usuń je z koszyka i dodaj ponownie.",
    en: "The lines of negotiation {{number}} do not match the agreed offer: {{reason}}. Remove them and add them again.",
  },
  reserved_metadata: {
    pl: "Pól metadanych zaczynających się od „negotiation_” nie można ustawiać.",
    en: "Metadata keys starting with “negotiation_” cannot be set.",
  },
  draft_order_exists: {
    pl: "Szkic zamówienia z tej negocjacji już istnieje.",
    en: "A draft order from this negotiation already exists.",
  },
  dry_run_required: {
    pl: "Najpierw wykonaj próbę na sucho z tymi samymi danymi.",
    en: "Run a dry run with the same data first.",
  },
  no_region: {
    pl: "Nie ma regionu z walutą {{currency}}. Wybierz region ręcznie.",
    en: "No region uses {{currency}}. Choose a region by hand.",
  },
} as const satisfies Record<string, Record<Locale, string>>

export type ReasonCode = keyof typeof REASONS

const TYPES: Partial<Record<ReasonCode, string>> = {
  not_signed_in: MedusaError.Types.UNAUTHORIZED,
  not_found: MedusaError.Types.NOT_FOUND,
  cart_not_found: MedusaError.Types.NOT_FOUND,
  variant_not_found: MedusaError.Types.NOT_FOUND,
  conflict: MedusaError.Types.CONFLICT,
  price_changed: MedusaError.Types.CONFLICT,
  write_in_progress: MedusaError.Types.CONFLICT,
  invalid_input: MedusaError.Types.INVALID_DATA,
}

const RATE_LIMITED: ReasonCode[] = ["limit_threads_per_hour", "limit_messages_per_hour"]

export function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ""))
}

/** A refusal with a code, parameters for the text and, for conflicts, the current state. */
export class NegotiationError extends MedusaError {
  readonly code: ReasonCode
  readonly params: Record<string, string | number>
  /** The thread as it is now, so the caller can show it instead of the stale one. */
  state?: unknown

  constructor(code: ReasonCode, params: Record<string, string | number> = {}) {
    super(TYPES[code] ?? MedusaError.Types.NOT_ALLOWED, fill(REASONS[code].en, params))
    this.code = code
    this.params = params
  }

  localized(locale: Locale): string {
    return fill(REASONS[this.code][locale], this.params)
  }

  get httpStatus(): number {
    if (RATE_LIMITED.includes(this.code)) return 429
    switch (this.type) {
      case MedusaError.Types.UNAUTHORIZED:
        return 401
      case MedusaError.Types.NOT_FOUND:
        return 404
      case MedusaError.Types.CONFLICT:
        return 409
      default:
        return 400
    }
  }

  withState(state: unknown): this {
    this.state = state
    return this
  }
}

export function normalizeLocale(value: string | null | undefined, fallback: Locale = "pl"): Locale {
  const lang = (value ?? "").trim().toLowerCase().slice(0, 2)
  return lang === "en" || lang === "pl" ? lang : fallback
}
