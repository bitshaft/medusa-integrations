import type { MedusaRequest } from "@medusajs/framework/http"

import { WHITELIST_VAT_MODULE } from "../../../modules/whitelist-vat"
import type WhitelistVatModuleService from "../../../modules/whitelist-vat/service"
import { parseTaxId } from "../identifiers"
import type { WhitelistVatPluginOptions } from "../options"
import type { FoundTaxId } from "../records"
import { POSITIVE_STATUSES, type Status } from "../verdict"
import type { SubjectRecord, Verification } from "../verify"

export function resolveWhitelistVat(req: MedusaRequest): WhitelistVatModuleService {
  return req.scope.resolve<WhitelistVatModuleService>(WHITELIST_VAT_MODULE)
}

/** The module with its options; throws the "disabled" error when the options are invalid. */
export async function resolveEnabled(req: MedusaRequest) {
  const service = resolveWhitelistVat(req)
  const options = await service.getOptions()
  return { service, options }
}

/** Verdicts that need a look: not a confirmed, registered business. */
export const PROBLEM_STATUSES: Status[] = ["unregistered", "inactive", "invalid", "not_found", "unverified"]

/** Answers older than this are stale. */
export function staleBefore(options: Pick<WhitelistVatPluginOptions, "cacheTtlHours">, now = new Date()): Date {
  return new Date(now.getTime() - options.cacheTtlHours * 3_600_000)
}

/** A stored subject as the admin shows it. */
export function describeSubject(subject: SubjectRecord, options: Pick<WhitelistVatPluginOptions, "cacheTtlHours">) {
  const checkedAt = subject.checked_at ? new Date(subject.checked_at) : null
  return {
    id: subject.id,
    number: subject.number,
    kind: subject.kind,
    country_code: subject.country_code,
    status: subject.status,
    verified: POSITIVE_STATUSES.includes(subject.status),
    name: subject.name,
    address: subject.address,
    company: subject.company,
    sources: subject.sources ?? {},
    bank_account_count: subject.bank_account_count,
    customer_id: subject.customer_id,
    checked_at: checkedAt ? checkedAt.toISOString() : null,
    stale: !checkedAt || checkedAt < staleBefore(options),
  }
}

/**
 * What a storefront gets: the verdict and the company's name and address
 * for the invoice form. Bank accounts, register IDs and per-register
 * details stay in the admin.
 */
export function describeForStore(verification: Verification) {
  const company = verification.company
  return {
    tax_id: {
      number: verification.tax_id.number,
      kind: verification.tax_id.kind,
      country_code: verification.tax_id.country_code,
      valid_format: verification.tax_id.valid,
      problem: verification.tax_id.problem ?? null,
    },
    status: verification.status,
    verified: verification.verified,
    could_not_verify: verification.could_not_verify,
    company: company
      ? {
          name: company.name ?? null,
          address: company.address ?? null,
          street: company.street ?? null,
          postal_code: company.postal_code ?? null,
          city: company.city ?? null,
          regon: company.regon ?? null,
          krs: company.krs ?? null,
        }
      : null,
    checked_at: verification.checked_at,
  }
}

/**
 * A sliding one-minute window per key, in memory. It keeps one visitor from
 * spending the store's daily white list quota; behind several instances
 * each one counts on its own, which is fine for that purpose.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly now: () => number = Date.now) {}

  /** True when the call is within the limit (and counts it). */
  allow(key: string, perMinute: number): boolean {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < 60_000)
    if (recent.length >= perMinute) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) {
      // Forget visitors who have been quiet for a minute.
      for (const [entry, times] of this.hits) {
        if (!times.some((time) => now - time < 60_000)) {
          this.hits.delete(entry)
        }
      }
    }
    return true
  }
}

/** A history row as the admin shows it. */
export function describeCheck(check: Record<string, unknown>) {
  return {
    id: check.id,
    number: check.number,
    source: check.source,
    outcome: check.outcome,
    status: check.status,
    request_id: check.request_id,
    error: check.error,
    from_cache: check.from_cache,
    trigger_type: check.trigger_type,
    name: check.name,
    order_id: check.order_id,
    customer_id: check.customer_id,
    checked_at: check.checked_at,
  }
}

/**
 * What the order and customer panels show: the tax ID on the record, the
 * stored verdict for it, and the record's own verification history.
 */
export async function describeRecord(
  service: WhitelistVatModuleService,
  options: WhitelistVatPluginOptions,
  taxId: FoundTaxId | null,
  filter: { order_id: string } | { customer_id: string }
) {
  const parsed = taxId ? parseTaxId(taxId.number, taxId.country_code ?? options.defaultCountry) : null
  const subject = parsed?.valid ? await service.findSubject(parsed.number) : null
  const checks = await service.listWhitelistVatChecks(filter, { take: 20, order: { checked_at: "DESC" } })
  return {
    tax_id:
      taxId && parsed
        ? {
            input: taxId.number,
            location: taxId.location,
            number: parsed.number,
            kind: parsed.kind,
            country_code: parsed.country_code,
            valid_format: parsed.valid,
            problem: parsed.problem ?? null,
          }
        : null,
    subject: subject ? describeSubject(subject, options) : null,
    checks: checks.map((check) => describeCheck(check as unknown as Record<string, unknown>)),
  }
}
