export type KeyInfo = {
  /** `secret` (sk_), `restricted` (rk_), `publishable` (pk_) or `unknown`. */
  kind: "secret" | "restricted" | "publishable" | "unknown"
  mode: "live" | "test" | "unknown"
  /** Last four characters, the only part of the key ever shown. */
  last4: string
}

/** What the admin may know about the key: its kind, mode and last four characters. */
export function describeKey(key: string | null | undefined): KeyInfo | null {
  if (!key) return null
  const match = /^(sk|rk|pk)_(live|test)_/.exec(key)
  const kinds = { sk: "secret", rk: "restricted", pk: "publishable" } as const
  return {
    kind: match ? kinds[match[1] as keyof typeof kinds] : "unknown",
    mode: match ? (match[2] as "live" | "test") : "unknown",
    last4: key.length > 8 ? key.slice(-4) : "",
  }
}

/** `rk_live_…a1b2`. */
export function maskKey(key: string | null | undefined): string {
  const info = describeKey(key)
  if (!info) return ""
  const prefix = /^(sk|rk|pk)_(live|test)_/.exec(key!)?.[0] ?? ""
  return `${prefix}…${info.last4}`
}
