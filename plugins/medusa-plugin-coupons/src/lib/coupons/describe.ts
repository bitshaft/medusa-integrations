import { DEFAULT_TIME_ZONE, formatDate, formatMoney, formatNumber, pluralPl } from "./format"
import { sortedTiers } from "./tiers"
import type { CouponDraft, CouponNames, Locale } from "./types"

export type DescribeOptions = { names?: CouponNames; timeZone?: string }

/** A list of names, or the count when the names are unknown. */
function listOf(ids: string[], names: Record<string, string> | undefined, locale: Locale, fallback: string): string {
  if (ids.length === 0) return fallback
  const labels = ids.map((id) => names?.[id] ?? id)
  return labels.join(locale === "pl" ? " i " : " and ")
}

/** The benefit part: "15% rabatu na całe zamówienie", "Darmowa dostawa", … */
function benefit(draft: CouponDraft, locale: Locale, options: DescribeOptions): string {
  const money = (amount: number) => formatMoney(amount, draft.currency_code, locale)
  const percent = (value: number) => `${formatNumber(value, locale)}%`

  if (draft.tiers && draft.tiers.length > 0 && (draft.kind === "percentage" || draft.kind === "fixed")) {
    const levels = sortedTiers(draft.tiers).map((tier) => {
      const value = draft.kind === "percentage" ? percent(tier.value) : money(tier.value)
      return locale === "pl" ? `${value} od ${money(tier.min)}` : `${value} from ${money(tier.min)}`
    })
    return locale === "pl" ? `Progi rabatu: ${levels.join(", ")}` : `Discount tiers: ${levels.join(", ")}`
  }

  switch (draft.kind) {
    case "percentage":
      return locale === "pl"
        ? `${percent(draft.value ?? 0)} rabatu na całe zamówienie`
        : `${percent(draft.value ?? 0)} off the whole order`
    case "fixed":
      return locale === "pl"
        ? `${money(draft.value ?? 0)} rabatu od zamówienia`
        : `${money(draft.value ?? 0)} off the order`
    case "free_shipping":
      return locale === "pl" ? "Darmowa dostawa" : "Free shipping"
    case "category": {
      const categories = listOf(draft.category_ids, options.names?.categories, locale, "")
      const value = percent(draft.value ?? 0)
      return locale === "pl"
        ? `${value} rabatu na: ${categories || "wybrane kategorie"}`
        : `${value} off: ${categories || "selected categories"}`
    }
    case "buy_get": {
      const buy = draft.buy_qty ?? 0
      const get = draft.get_qty ?? 0
      const products = listOf(draft.buy_product_ids, options.names?.products, locale, "")
      const free = (draft.value ?? 100) >= 100
      const offer =
        locale === "pl"
          ? `Kup ${buy}, ${free ? `${get} gratis` : `${get} z rabatem ${percent(draft.value ?? 0)}`}`
          : `Buy ${buy}, ${free ? `get ${get} free` : `get ${get} at ${percent(draft.value ?? 0)} off`}`
      return products ? `${offer}: ${products}` : offer
    }
  }
}

/** The validity part: "od 1 paź 2026 do 30 lis 2026", "bez terminu" … */
function validity(draft: CouponDraft, locale: Locale, timeZone: string): string {
  const start = draft.starts_at ? formatDate(draft.starts_at, locale, timeZone) : null
  const end = draft.ends_at ? formatDate(draft.ends_at, locale, timeZone) : null
  if (locale === "pl") {
    if (start && end) return `od ${start} do ${end}`
    if (start) return `od ${start}`
    if (end) return `do ${end}`
    return "bez terminu ważności"
  }
  if (start && end) return `from ${start} to ${end}`
  if (start) return `from ${start}`
  if (end) return `until ${end}`
  return "with no end date"
}

/** The audience part: "dla wszystkich", "dla grup: B2B Premium", "dla wybranych klientów (3)". */
function audience(draft: CouponDraft, locale: Locale, options: DescribeOptions): string {
  if (draft.audience === "all") return locale === "pl" ? "dla wszystkich" : "for everyone"
  if (draft.audience === "groups") {
    const names = listOf(draft.audience_ids, options.names?.groups, locale, "")
    if (locale === "pl") return names ? `dla grup: ${names}` : `dla grup klientów (${draft.audience_ids.length})`
    return names ? `for groups: ${names}` : `for ${draft.audience_ids.length} customer groups`
  }
  const count = draft.audience_ids.length
  return locale === "pl"
    ? `dla wybranych klientów (${count})`
    : `for ${count} selected ${count === 1 ? "customer" : "customers"}`
}

/** The limits part: "do 500 użyć łącznie", "1 użycie na klienta". */
function limits(draft: CouponDraft, locale: Locale): string[] {
  const parts: string[] = []
  if (draft.usage_limit != null) {
    const n = draft.usage_limit
    parts.push(
      locale === "pl"
        ? `do ${n} ${pluralPl(n, ["użycia", "użycia", "użyć"])} łącznie`
        : `up to ${n} ${n === 1 ? "use" : "uses"} in total`
    )
  }
  if (draft.per_customer_limit != null) {
    const n = draft.per_customer_limit
    parts.push(
      locale === "pl"
        ? `${n} ${pluralPl(n, ["użycie", "użycia", "użyć"])} na klienta`
        : `${n} ${n === 1 ? "use" : "uses"} per customer`
    )
  }
  return parts
}

/**
 * The one-sentence summary of a coupon, for the list, the wizard preview and
 * the CSV export. Every part comes from the stored settings, so a sentence
 * never mentions something the coupon does not do.
 *
 * `describeCoupon({ kind: "percentage", value: 15, code: "JESIEN15", … }, "pl")`
 * → "15% rabatu na całe zamówienie, z kodem JESIEN15, od 1 paź 2026 do 30 lis 2026, dla wszystkich, do 500 użyć łącznie."
 */
export function describeCoupon(draft: CouponDraft, locale: Locale, options: DescribeOptions = {}): string {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE
  const parts: string[] = [benefit(draft, locale, options)]

  if (draft.automatic || !draft.code) {
    parts.push(locale === "pl" ? "automatycznie, bez kodu" : "automatically, no code")
  } else {
    parts.push(locale === "pl" ? `z kodem ${draft.code}` : `with code ${draft.code}`)
  }

  parts.push(validity(draft, locale, timeZone))
  parts.push(audience(draft, locale, options))

  if (draft.first_order_only) {
    parts.push(locale === "pl" ? "tylko pierwsze zamówienie klienta" : "first order only")
  }
  if (draft.min_subtotal != null && draft.min_subtotal > 0) {
    const money = formatMoney(draft.min_subtotal, draft.currency_code, locale)
    parts.push(locale === "pl" ? `koszyk od ${money} brutto` : `basket from ${money} gross`)
  }
  parts.push(...limits(draft, locale))
  if (draft.exclusive) {
    parts.push(locale === "pl" ? "nie łączy się z innymi kuponami" : "cannot be combined with other coupons")
  }

  return `${parts.join(", ")}.`
}
