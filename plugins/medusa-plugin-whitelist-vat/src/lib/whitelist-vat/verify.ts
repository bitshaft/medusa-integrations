import { type ParsedTaxId, parseTaxId } from "./identifiers"
import type { WhitelistVatPluginOptions } from "./options"
import type { GusClient } from "./registers/gus"
import type { MfClient } from "./registers/mf"
import type { CompanyData, Outcome, RegisterResult, Source } from "./registers/types"
import type { ViesClient } from "./registers/vies"
import { decideStatus, mergeCompany, mergeSources, POSITIVE_STATUSES, type SourceStates, type Status } from "./verdict"

export type VerifyInput = {
  /** The tax ID as typed: `526-025-02-74`, `PL5260250274`, `DE123456789`… */
  number: string
  /** Country for numbers without a prefix (usually the billing country). */
  country_code?: string | null
  /** Ask the registers even when a recent answer is stored. */
  force?: boolean
  /** What asked: `checkout`, `order`, `admin`, `workflow`. */
  trigger?: string
  order_id?: string | null
  customer_id?: string | null
  cart_id?: string | null
}

export type Verification = {
  tax_id: Pick<ParsedTaxId, "input" | "number" | "kind" | "country_code" | "valid" | "problem">
  status: Status
  /** A registered or confirmed business (`active`, `exempt`, `valid`). */
  verified: boolean
  /** No register could be asked. Treat as "unknown", never as "invalid". */
  could_not_verify: boolean
  company: CompanyData | null
  sources: SourceStates
  /** Last time a register answered, ISO 8601. */
  checked_at: string | null
  /** The stored answer is older than `cacheTtlHours`. */
  stale: boolean
  /** Answered from the stored subject without asking the registers. */
  from_cache: boolean
  subject_id: string | null
}

export type SubjectRecord = {
  id: string
  number: string
  kind: "nip" | "eu_vat"
  country_code: string
  status: Status
  name: string | null
  address: string | null
  company: CompanyData | null
  sources: SourceStates | null
  bank_account_count: number
  customer_id: string | null
  checked_at: Date | string | null
}

export type CheckRow = {
  number: string
  source: Source | "local"
  outcome: Outcome
  status: Status
  request_id: string | null
  error: string | null
  duration_ms: number | null
  from_cache: boolean
  trigger_type: string | null
  name: string | null
  order_id: string | null
  customer_id: string | null
  cart_id: string | null
  checked_at: Date
}

/** The persistence the verification needs; the module service implements it. */
export type VerificationStore = {
  findSubject(number: string): Promise<SubjectRecord | null>
  saveSubject(data: Omit<SubjectRecord, "id">): Promise<SubjectRecord>
  recordChecks(rows: CheckRow[]): Promise<void>
  /** Requests really sent to a register since the given moment. */
  countRequestsSince(source: Source, since: Date): Promise<number>
}

export type Registers = { mf?: MfClient; gus?: Pick<GusClient, "searchNip">; vies?: ViesClient }

export type VerifyDependencies = {
  store: VerificationStore
  registers: Registers
  options: WhitelistVatPluginOptions
  now?: () => Date
}

/**
 * Verifies a tax ID: checks its format and check digit, reuses a recent
 * answer when there is one, otherwise asks the registers in parallel,
 * merges what they say into one verdict and writes the history.
 *
 * It does not throw for register problems. A register that is down, slow or
 * over its limit counts as `unavailable`; when none can answer the verdict
 * is `unverified`.
 */
export async function verifyTaxId(deps: VerifyDependencies, input: VerifyInput): Promise<Verification> {
  const { store, options } = deps
  const now = deps.now ?? (() => new Date())
  const parsed = parseTaxId(input.number, input.country_code ?? options.defaultCountry)
  const context = {
    trigger_type: input.trigger ?? "workflow",
    order_id: input.order_id ?? null,
    customer_id: input.customer_id ?? null,
    cart_id: input.cart_id ?? null,
  }

  if (!parsed.valid) {
    // Only kept as history when it belongs to an order; lookups of typos are not worth a row.
    if (context.order_id && parsed.problem !== "empty") {
      await store.recordChecks([
        {
          ...context,
          number: parsed.number,
          source: "local",
          outcome: "invalid",
          status: "invalid",
          request_id: null,
          error: problemText(parsed),
          duration_ms: null,
          from_cache: false,
          name: null,
          checked_at: now(),
        },
      ])
    }
    return {
      tax_id: describeTaxId(parsed),
      status: "invalid",
      verified: false,
      could_not_verify: false,
      company: null,
      sources: {},
      checked_at: null,
      stale: false,
      from_cache: false,
      subject_id: null,
    }
  }

  const subject = await store.findSubject(parsed.number)
  const ttlMs = options.cacheTtlHours * 3_600_000
  const checkedAt = subject?.checked_at ? new Date(subject.checked_at) : null
  const fresh = Boolean(checkedAt && now().getTime() - checkedAt.getTime() < ttlMs && subject!.status !== "unverified")

  if (subject && fresh && !input.force) {
    const sources = subject.sources ?? {}
    if (context.order_id) {
      // The order gets its own proof rows, pointing at the answers that were reused.
      await store.recordChecks(
        Object.entries(sources)
          .filter(([, state]) => state.outcome !== "unavailable")
          .map(([source, state]) => ({
            ...context,
            number: subject.number,
            source: source as Source,
            outcome: state.outcome,
            status: subject.status,
            request_id: state.request_id,
            error: null,
            duration_ms: null,
            from_cache: true,
            name: subject.name,
            checked_at: new Date(state.checked_at),
          }))
      )
    }
    const linked =
      context.customer_id && context.customer_id !== subject.customer_id
        ? await store.saveSubject({ ...subject, customer_id: context.customer_id })
        : subject
    return toVerification(parsed, linked, false, true)
  }

  const results = await askRegisters(deps, parsed, now)
  const sources = mergeSources(subject?.sources ?? {}, results)
  const status = decideStatus(sources)
  const company = mergeCompany(subject?.company ?? null, results)
  const answered = results.some((result) => result.outcome !== "unavailable")

  const saved = await store.saveSubject({
    number: parsed.number,
    kind: parsed.kind,
    country_code: parsed.country_code,
    status,
    name: company?.name ?? null,
    address: company?.address ?? null,
    company,
    sources,
    bank_account_count: company?.bank_accounts?.length ?? 0,
    customer_id: context.customer_id ?? subject?.customer_id ?? null,
    checked_at: answered ? now() : (subject?.checked_at ?? null),
  })

  await store.recordChecks(
    results.map((result) => ({
      ...context,
      number: parsed.number,
      source: result.source,
      outcome: result.outcome,
      status,
      request_id: result.request_id,
      error: result.error,
      duration_ms: result.duration_ms,
      from_cache: false,
      name: result.company?.name ?? null,
      checked_at: result.checked_at,
    }))
  )

  // After a failed refresh the old answer is still what we know; say that it is old.
  const stale = !answered && Boolean(saved.checked_at)
  return toVerification(parsed, saved, stale, false)
}

async function askRegisters(deps: VerifyDependencies, parsed: ParsedTaxId, now: () => Date): Promise<RegisterResult[]> {
  const { registers, options, store } = deps
  const requests: Array<Promise<RegisterResult>> = []

  if (parsed.kind === "nip") {
    if (registers.mf) {
      const used = await store.countRequestsSince("mf", startOfWarsawDay(now()))
      requests.push(
        used >= options.mf.dailyLimit
          ? Promise.resolve(
              skipped(
                "mf",
                `The daily limit of ${options.mf.dailyLimit} white list requests is used up; it resets at midnight`,
                now
              )
            )
          : registers.mf.searchNip(parsed.local)
      )
    }
    if (registers.gus) {
      requests.push(registers.gus.searchNip(parsed.local))
    }
  } else if (registers.vies) {
    requests.push(registers.vies.check(parsed.country_code, parsed.local))
  }

  // Clients return results instead of throwing; this guards against a bug in one of them.
  const settled = await Promise.allSettled(requests)
  return settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []))
}

function skipped(source: Source, error: string, now: () => Date): RegisterResult {
  return {
    source,
    outcome: "unavailable",
    request_id: null,
    checked_at: now(),
    company: null,
    error,
    duration_ms: null,
  }
}

function toVerification(parsed: ParsedTaxId, subject: SubjectRecord, stale: boolean, fromCache: boolean): Verification {
  return {
    tax_id: describeTaxId(parsed),
    status: subject.status,
    verified: POSITIVE_STATUSES.includes(subject.status),
    could_not_verify: subject.status === "unverified",
    company: subject.company,
    sources: subject.sources ?? {},
    checked_at: subject.checked_at ? new Date(subject.checked_at).toISOString() : null,
    stale,
    from_cache: fromCache,
    subject_id: subject.id,
  }
}

function describeTaxId(parsed: ParsedTaxId): Verification["tax_id"] {
  const { input, number, kind, country_code, valid, problem } = parsed
  return { input, number, kind, country_code, valid, problem }
}

function problemText(parsed: ParsedTaxId): string {
  switch (parsed.problem) {
    case "checksum":
      return "The check digit of the NIP is wrong"
    case "unknown_country":
      return "The country prefix is not an EU member state"
    default:
      return `Not a ${parsed.kind === "nip" ? "NIP (10 digits)" : `${parsed.country_code} VAT number`}`
  }
}

/** Midnight in Poland before `date`: the white list counts requests per Polish calendar day. */
export function startOfWarsawDay(date: Date): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(date)
  const hourInWarsaw = (instant: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(instant)
  // Poland is UTC+1 in winter and UTC+2 in summer.
  for (const offset of ["+01:00", "+02:00"]) {
    const candidate = new Date(`${day}T00:00:00${offset}`)
    if (hourInWarsaw(candidate) === "00") {
      return candidate
    }
  }
  return new Date(`${day}T00:00:00+01:00`)
}
