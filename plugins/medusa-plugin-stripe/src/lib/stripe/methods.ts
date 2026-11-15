export const METHOD_GROUPS = ["card", "blik", "p24", "apple_pay", "google_pay", "other"] as const
export type MethodGroup = (typeof METHOD_GROUPS)[number]

type Details = Record<string, any> | null | undefined

/** Which table row a charge belongs to: cards, BLIK, Przelewy24, Apple Pay, Google Pay or other. */
export function methodGroup(details: Details, fallbackTypes: string[] = []): MethodGroup {
  const type = details?.type ?? fallbackTypes[0]
  if (type === "card") {
    const wallet = details?.card?.wallet?.type
    if (wallet === "apple_pay") return "apple_pay"
    if (wallet === "google_pay") return "google_pay"
    return "card"
  }
  if (type === "blik") return "blik"
  if (type === "p24") return "p24"
  return "other"
}

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
}

/** `Visa •••• 4242`, `Apple Pay (Visa •••• 4242)`, `BLIK`, `Przelewy24 (mBank)`. */
export function methodLabel(details: Details, fallbackTypes: string[] = []): string {
  const type = details?.type ?? fallbackTypes[0]
  if (type === "card") {
    const card = details?.card ?? {}
    const brand = BRANDS[card.brand] ?? (card.brand ? String(card.brand) : "Card")
    const base = card.last4 ? `${brand} •••• ${card.last4}` : brand
    const wallet = card.wallet?.type
    if (wallet === "apple_pay") return `Apple Pay (${base})`
    if (wallet === "google_pay") return `Google Pay (${base})`
    return base
  }
  if (type === "blik") return "BLIK"
  if (type === "p24") return details?.p24?.bank ? `Przelewy24 (${details.p24.bank})` : "Przelewy24"
  return type ? String(type) : "—"
}
