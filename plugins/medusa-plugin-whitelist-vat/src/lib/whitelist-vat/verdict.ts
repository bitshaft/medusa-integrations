import type { CompanyData, Outcome, RegisterResult, Source } from "./registers/types"

/**
 * The plugin's verdict about a tax ID, combined from every register asked.
 *
 * - `active`: active VAT payer on the Polish white list
 * - `exempt`: on the white list as exempt from VAT
 * - `unregistered`: a real business that is not a registered VAT payer
 * - `inactive`: GUS reports the business has ended its activity
 * - `valid`: EU VAT number confirmed by VIES
 * - `invalid`: wrong format or check digit, or VIES says the number is not valid
 * - `not_found`: the registers answered and none knows the number
 * - `unverified`: no register could be asked. Says nothing about the number.
 */
export const STATUSES = [
  "active",
  "exempt",
  "unregistered",
  "inactive",
  "valid",
  "invalid",
  "not_found",
  "unverified",
] as const
export type Status = (typeof STATUSES)[number]

/** Statuses that mean "this buyer checks out": a registered or confirmed business. */
export const POSITIVE_STATUSES: Status[] = ["active", "exempt", "valid"]

/** The last answer of one register, as stored with the subject. */
export type SourceState = {
  outcome: Outcome
  request_id: string | null
  checked_at: string
  error: string | null
}

export type SourceStates = Partial<Record<Source, SourceState>>

export function toSourceState(result: RegisterResult): SourceState {
  return {
    outcome: result.outcome,
    request_id: result.request_id,
    checked_at: result.checked_at.toISOString(),
    error: result.error,
  }
}

/**
 * Merges new answers into what is already known. A register that is
 * unavailable now does not erase what it said before: the earlier answer
 * stays (with its date), so an outage never downgrades a verified business.
 */
export function mergeSources(previous: SourceStates, results: RegisterResult[]): SourceStates {
  const merged: SourceStates = { ...previous }
  for (const result of results) {
    const known = previous[result.source]
    if (result.outcome === "unavailable" && known && known.outcome !== "unavailable") {
      continue
    }
    merged[result.source] = toSourceState(result)
  }
  return merged
}

/** The verdict from the registers' answers. */
export function decideStatus(sources: SourceStates): Status {
  const answers = Object.values(sources).filter((state) => state.outcome !== "unavailable")
  if (!answers.length) {
    return "unverified"
  }
  const mf = sources.mf?.outcome
  const gus = sources.gus?.outcome
  const vies = sources.vies?.outcome

  // The white list is the authority on Polish VAT status.
  if (mf === "active" || mf === "exempt") {
    return gus === "inactive" ? "inactive" : mf
  }
  if (gus === "inactive") {
    return "inactive"
  }
  if (mf === "unregistered") {
    return "unregistered"
  }
  if (vies === "valid") {
    return "valid"
  }
  if (gus === "found") {
    // Known to the business register; not on the VAT list (or the list could not be asked).
    return mf === "not_found" ? "unregistered" : "unverified"
  }
  if (vies === "invalid") {
    return "invalid"
  }
  return "not_found"
}

/** Company data from the answers, the most authoritative register first per field. */
export function mergeCompany(previous: CompanyData | null, results: RegisterResult[]): CompanyData | null {
  const bySource = new Map(results.filter((result) => result.company).map((result) => [result.source, result.company!]))
  const ordered = [bySource.get("mf"), bySource.get("gus"), bySource.get("vies"), previous].filter(
    (company): company is CompanyData => Boolean(company)
  )
  if (!ordered.length) {
    return null
  }
  const pick = <K extends keyof CompanyData>(key: K): CompanyData[K] | null => {
    for (const company of ordered) {
      const value = company[key]
      if (value !== undefined && value !== null && value !== "") {
        return value
      }
    }
    return null
  }
  // Street, postal code and city must come from the same register as each other.
  const structured = ordered.find((company) => company.postal_code && company.city)
  return {
    name: pick("name"),
    address: pick("address"),
    street: structured?.street ?? null,
    postal_code: structured?.postal_code ?? null,
    city: structured?.city ?? null,
    regon: pick("regon"),
    krs: pick("krs"),
    legal_form: pick("legal_form"),
    bank_accounts: (bySource.get("mf") ?? previous)?.bank_accounts ?? [],
    registered_at: pick("registered_at"),
  }
}
