import { randomInt } from "node:crypto"

import { normalizeCode } from "./format"
import type { CouponKind } from "./types"

/** No 0/O or 1/I/L, so codes read out loud and on paper stay unambiguous. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,39}$/

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(normalizeCode(code))
}

/** A random code of `length` characters from `CODE_ALPHABET`, with an optional prefix. */
export function randomCode(length = 10, prefix = "", random: (max: number) => number = randomInt): string {
  let body = ""
  for (let i = 0; i < length; i++) {
    body += CODE_ALPHABET[random(CODE_ALPHABET.length)]
  }
  return normalizeCode(`${prefix}${body}`)
}

/**
 * The "Podpowiedz" button: a readable code from the benefit, e.g.
 * `percentage 15` → "RABAT15", `free_shipping` → "DOSTAWA", `fixed 50` → "RABAT50".
 * Later candidates add "-2", "-3": "RABAT152" would read as 152%.
 */
export function codeCandidates(input: { kind: CouponKind; value?: number | null }, count = 20): string[] {
  const base =
    input.kind === "free_shipping"
      ? "DOSTAWA"
      : input.kind === "buy_get"
        ? "GRATIS"
        : input.kind === "category"
          ? "KATEGORIA"
          : "RABAT"
  const value =
    input.value != null && Number.isFinite(input.value) && input.kind !== "free_shipping"
      ? String(Math.round(input.value))
      : ""
  const first = `${base}${value}`
  return [first, ...Array.from({ length: count - 1 }, (_, i) => `${first}-${i + 2}`)]
}

/** The first candidate not `taken`, or a random code when all are. */
export function suggestCode(
  input: { kind: CouponKind; value?: number | null },
  taken: (code: string) => boolean = () => false
): string {
  return codeCandidates(input).find((code) => !taken(code)) ?? randomCode(8)
}
