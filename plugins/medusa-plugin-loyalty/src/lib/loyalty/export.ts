import { toCsv } from "./csv"
import type { Locale } from "./types"

export type ExportEntry = {
  created_at: Date | string
  type: string
  reason: string
  points: number
  balance_after: number
  description: string | null
  order_id: string | null
  code: string | null
  actor_type: string
  actor_id: string | null
}

const TYPE: Record<Locale, Record<string, string>> = {
  pl: {
    order: "zamówienie",
    action: "akcja",
    redemption: "wymiana",
    return: "zwrot",
    expiry: "wygaśnięcie",
    adjustment: "korekta ręczna",
    tier_bonus: "bonus poziomu",
  },
  en: {
    order: "order",
    action: "action",
    redemption: "redemption",
    return: "return",
    expiry: "expiry",
    adjustment: "manual correction",
    tier_bonus: "tier bonus",
  },
}

const REASON: Record<Locale, Record<string, string>> = {
  pl: {
    earn: "naliczenie",
    cancel: "anulowanie",
    return: "zwrot towaru",
    signup: "rejestracja",
    first_order: "pierwsze zamówienie",
    birthday: "urodziny",
    newsletter: "newsletter",
    redeem: "wymiana na nagrodę",
    redeem_returned: "zwrot punktów za nagrodę",
    expired: "brak aktywności",
    manual: "korekta",
    tier_bonus: "awans na poziom",
  },
  en: {
    earn: "earned",
    cancel: "canceled",
    return: "items returned",
    signup: "sign-up",
    first_order: "first order",
    birthday: "birthday",
    newsletter: "newsletter",
    redeem: "reward redeemed",
    redeem_returned: "reward points returned",
    expired: "inactivity",
    manual: "correction",
    tier_bonus: "tier reached",
  },
}

/** A customer's ledger as CSV, in the given language and time zone. */
export function ledgerCsv(entries: ExportEntry[], locale: Locale, timeZone: string): string {
  const header =
    locale === "pl"
      ? ["Data", "Typ", "Przyczyna", "Punkty", "Saldo po", "Opis", "Zamówienie", "Kod", "Kto", "ID użytkownika"]
      : ["Date", "Type", "Cause", "Points", "Balance after", "Description", "Order", "Code", "By", "User ID"]
  const when = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  })
  const actor: Record<string, string> =
    locale === "pl"
      ? { system: "system", admin: "administrator", customer: "klient" }
      : { system: "system", admin: "admin", customer: "customer" }
  return toCsv(
    header,
    entries.map((e) => [
      when.format(new Date(e.created_at)),
      TYPE[locale][e.type] ?? e.type,
      REASON[locale][e.reason] ?? e.reason,
      e.points,
      e.balance_after,
      e.description,
      e.order_id,
      e.code,
      actor[e.actor_type] ?? e.actor_type,
      e.actor_id,
    ])
  )
}
