/** The registers the plugin asks. `local` is the check-digit validation done before any request. */
export const SOURCES = ["mf", "gus", "vies"] as const
export type Source = (typeof SOURCES)[number]

/**
 * What one register said about one number.
 *
 * - `active`, `exempt`, `unregistered`: VAT status on the Polish white list
 * - `valid`, `invalid`: VIES
 * - `found`, `inactive`: GUS knows the business (`inactive`: it has ended its activity)
 * - `not_found`: the register answered and has no such entry
 * - `unavailable`: the register could not be asked (down, timeout, limit
 *   reached). This says nothing about the number.
 */
export const OUTCOMES = [
  "active",
  "exempt",
  "unregistered",
  "valid",
  "invalid",
  "found",
  "inactive",
  "not_found",
  "unavailable",
] as const
export type Outcome = (typeof OUTCOMES)[number]

export type CompanyData = {
  name?: string | null
  /** One line, as the register prints it. */
  address?: string | null
  street?: string | null
  postal_code?: string | null
  city?: string | null
  regon?: string | null
  krs?: string | null
  /** `legal_entity` or `sole_proprietorship`, when the register tells. */
  legal_form?: string | null
  /** Bank accounts registered on the white list (26 digits each). */
  bank_accounts?: string[]
  /** Date of registration as a VAT payer, `YYYY-MM-DD`. */
  registered_at?: string | null
}

export type RegisterResult = {
  source: Source
  outcome: Outcome
  /** The register's own ID of the answer: proof that the check was made. */
  request_id: string | null
  checked_at: Date
  company: CompanyData | null
  /** For `unavailable`: what went wrong, safe to show and log. */
  error: string | null
  /** `null` for answers the plugin made up without a request (e.g. its own daily limit was reached). */
  duration_ms: number | null
}

/** A register that could not be asked. Never thrown past the client: callers get a result. */
export function unavailable(source: Source, error: string, startedAt: number, now: () => number): RegisterResult {
  return {
    source,
    outcome: "unavailable",
    request_id: null,
    checked_at: new Date(now()),
    company: null,
    error: error.replace(/\s+/g, " ").trim().slice(0, 500),
    duration_ms: now() - startedAt,
  }
}

/** `UL. LIPOWA 1, 00-001 WARSZAWA` → street, postal code and city, when the line has that shape. */
export function splitPolishAddress(
  address: string | null | undefined
): Pick<CompanyData, "street" | "postal_code" | "city"> {
  const match = /^(.*?),?\s*(\d{2}-\d{3})\s+(.+)$/.exec(address?.trim() ?? "")
  if (!match) {
    return {}
  }
  return { street: match[1].trim() || null, postal_code: match[2], city: match[3].trim() }
}
