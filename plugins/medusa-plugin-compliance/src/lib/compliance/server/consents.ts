import type { MedusaContainer } from "@medusajs/framework/types"

import {
  type ConsentEntryRecord,
  consentState,
  type ConsentText,
  type ConsentTypeRecord,
  type ConsentVersionRecord,
  linkEntries,
  planVersion,
  resolveGrantVersion,
  withPlaceholders,
} from "../consents"
import { ComplianceError } from "../messages"
import { normalizeEmail, rateLimitWait } from "../requests"
import { type ActorType, type ConsentPlacement, type ConsentSource, type CookieCategory } from "../types"
import { onlyLanguages, storeLanguages } from "./languages"
import { ComplianceEvents, emit, resolveCompliance } from "./runtime"

type Row = Record<string, any>

export type Subject = { customer_id?: string | null; email?: string | null; anonymous_id?: string | null }
export type Actor = { type: ActorType; id: string | null }

const toType = (row: Row): ConsentTypeRecord & { id: string } => ({
  id: row.id,
  key: row.key,
  name: row.name ?? {},
  placement: row.placement,
  required: Boolean(row.required),
  active: Boolean(row.active),
  cookie_category: row.cookie_category ?? null,
})

const toVersion = (row: Row): ConsentVersionRecord => ({
  type_key: row.type_key,
  version: Number(row.version),
  text: row.text ?? {},
  text_hash: row.text_hash,
  created_at: new Date(row.created_at),
})

const toEntry = (row: Row): ConsentEntryRecord & Row => ({
  ...row,
  type_key: row.type_key,
  version: Number(row.version),
  granted: Boolean(row.granted),
  created_at: new Date(row.created_at),
})

export async function loadConsentTypes(container: MedusaContainer, options: { activeOnly?: boolean } = {}) {
  const service = resolveCompliance(container)
  const types = (await service.listComplianceConsentTypes(options.activeOnly ? { active: true } : {})).map((t) =>
    toType(t as Row)
  )
  const versions = types.length
    ? (await service.listComplianceConsentVersions({ type_key: types.map((t) => t.key) })).map((v) =>
        toVersion(v as Row)
      )
    : []
  return { types, versions }
}

/** Consent types with their current text, for a storefront form or the admin. */
export async function consentCatalog(container: MedusaContainer, placement?: ConsentPlacement) {
  const { types, versions } = await loadConsentTypes(container, { activeOnly: true })
  return types
    .filter((t) => !placement || t.placement === placement)
    .map((t) => {
      const latest = versions.filter((v) => v.type_key === t.key).sort((a, b) => b.version - a.version)[0]
      return {
        key: t.key,
        name: t.name,
        placement: t.placement,
        required: t.required,
        cookie_category: t.cookie_category,
        version: latest?.version ?? null,
        text: latest?.text ?? {},
        updated_at: latest?.created_at ?? null,
      }
    })
}

export type ConsentTypeInput = {
  key: string
  name: ConsentText
  placement: ConsentPlacement
  required: boolean
  active: boolean
  cookie_category: CookieCategory | null
  text: ConsentText
}

/**
 * Creates or updates a consent type. A changed text becomes a new version;
 * earlier versions and the entries given to them stay as they were. The
 * name and text are kept in the store's languages only.
 */
export async function saveConsentType(container: MedusaContainer, input: ConsentTypeInput, actor: Actor) {
  const service = resolveCompliance(container)
  const languages = await storeLanguages(container, (await service.getOptions()).defaultLocale, { strict: true })
  const [existing] = await service.listComplianceConsentTypes({ key: input.key })
  const config = {
    name: onlyLanguages(input.name, languages),
    placement: input.placement,
    required: input.required,
    active: input.active,
    cookie_category: input.placement === "cookies" ? input.cookie_category : null,
  }
  if (existing) await service.updateComplianceConsentTypes({ id: existing.id, ...config } as never)
  else await service.createComplianceConsentTypes({ key: input.key, ...config } as never)

  const versions = (await service.listComplianceConsentVersions({ type_key: input.key })).map((v) =>
    toVersion(v as Row)
  )
  const text = withPlaceholders(input.text, languages)
  const plan = planVersion(versions, input.key, text)
  if (plan.create) {
    await service.createComplianceConsentVersions({
      type_key: input.key,
      version: plan.version,
      text,
      text_hash: plan.text_hash,
      actor_id: actor.id,
    } as never)
  }
  return { key: input.key, version: plan.version, new_version: plan.create }
}

function subjectFilter(subject: Subject): Row | null {
  const or: Row[] = []
  if (subject.customer_id) or.push({ customer_id: subject.customer_id })
  if (subject.email) or.push({ email: normalizeEmail(subject.email) })
  if (subject.anonymous_id) or.push({ anonymous_id: subject.anonymous_id })
  return or.length ? { $or: or } : null
}

export async function subjectEntries(container: MedusaContainer, subject: Subject) {
  const filter = subjectFilter(subject)
  if (!filter) return []
  const rows = await resolveCompliance(container).listComplianceConsentEntries(filter, {
    order: { created_at: "ASC" },
    take: 10_000,
  })
  return rows.map((r) => toEntry(r as Row))
}

/** The current state of every active consent type for a subject. */
export async function subjectState(container: MedusaContainer, subject: Subject) {
  const { types, versions } = await loadConsentTypes(container, { activeOnly: true })
  return consentState(await subjectEntries(container, subject), types, versions)
}

export type ConsentChoice = { type_key: string; granted: boolean; version?: number }

/**
 * Appends consent entries. Grants must be for the current text; required
 * consents cannot be withdrawn from the storefront. Choices equal to the
 * current state are skipped, so repeated form posts add nothing.
 */
export async function recordConsents(
  container: MedusaContainer,
  input: {
    subject: Subject
    /** Whose current state decides what is new; defaults to `subject`. */
    stateSubject?: Subject
    choices: ConsentChoice[]
    source: ConsentSource
    placement?: string | null
    actor: Actor
    ip_hash?: string | null
  }
) {
  const { subject } = input
  if (!subject.customer_id && !subject.email && !subject.anonymous_id) throw new ComplianceError("subject_missing")
  const service = resolveCompliance(container)
  const { types, versions } = await loadConsentTypes(container, { activeOnly: true })
  const current = consentState(await subjectEntries(container, input.stateSubject ?? subject), types, versions)

  const rows: Row[] = []
  for (const choice of input.choices) {
    const type = types.find((t) => t.key === choice.type_key)
    if (!type) throw new ComplianceError("consent_type_unknown", { id: choice.type_key })
    let version: number
    if (choice.granted) {
      const resolved = resolveGrantVersion(versions, type.key, choice.version)
      if (!resolved.ok) {
        throw new ComplianceError(
          resolved.reason === "outdated" ? "consent_version_outdated" : "consent_type_unknown",
          {
            id: type.key,
          }
        )
      }
      version = resolved.version
    } else {
      if (type.required && input.source === "storefront")
        throw new ComplianceError("consent_required", { id: type.key })
      version = current.find((s) => s.type_key === type.key)?.version ?? choice.version ?? 0
    }
    const state = current.find((s) => s.type_key === type.key)
    if (state && state.at && state.granted === choice.granted && state.version === version) continue
    rows.push({
      type_key: type.key,
      version,
      granted: choice.granted,
      customer_id: subject.customer_id ?? null,
      email: subject.email ? normalizeEmail(subject.email) : null,
      anonymous_id: subject.anonymous_id ?? null,
      source: input.source,
      placement: input.placement ?? type.placement,
      actor_type: input.actor.type,
      actor_id: input.actor.id,
      ip_hash: input.ip_hash ?? null,
    })
  }
  if (!rows.length) return []
  const created = (await service.createComplianceConsentEntries(rows as never)) as unknown as Row[]
  for (const entry of created) {
    await emit(container, entry.granted ? ComplianceEvents.CONSENT_GRANTED : ComplianceEvents.CONSENT_WITHDRAWN, {
      id: entry.id,
      type_key: entry.type_key,
      version: entry.version,
      customer_id: entry.customer_id,
      email: entry.email,
      anonymous_id: entry.anonymous_id,
      placement: entry.placement,
      source: entry.source,
    })
  }
  return created
}

/** After sign-in: copies the browser's cookie choices (anonymous id) to the customer. */
export async function linkAnonymousConsents(container: MedusaContainer, customerId: string, anonymousId: string) {
  const { types, versions } = await loadConsentTypes(container, { activeOnly: true })
  const anonymous = await subjectEntries(container, { anonymous_id: anonymousId })
  const mine = await subjectEntries(container, { customer_id: customerId })
  // Choices given to an older text are not carried over; the banner asks again.
  const latest = new Map(
    types.map((t) => [t.key, Math.max(0, ...versions.filter((v) => v.type_key === t.key).map((v) => v.version))])
  )
  const choices = linkEntries(anonymous, mine, types, versions).filter(
    (c) => !c.granted || c.version === latest.get(c.type_key)
  )
  if (!choices.length) return []
  return recordConsents(container, {
    subject: { customer_id: customerId, anonymous_id: anonymousId },
    stateSubject: { customer_id: customerId },
    choices,
    source: "link",
    placement: "cookies",
    actor: { type: "customer", id: customerId },
  })
}

/**
 * Consents given with only an e-mail are limited per address and per IP
 * (`gdpr.consent_rate_limit`), so nobody can write consents for a list of
 * addresses. Signed-in customers and the cookie banner are not limited.
 */
export async function checkEmailConsentLimit(
  container: MedusaContainer,
  input: { email: string; ip_hash: string | null; now?: Date }
) {
  const service = resolveCompliance(container)
  const limits = (await service.getSettings()).gdpr.consent_rate_limit
  const now = input.now ?? new Date()
  const email = normalizeEmail(input.email)
  const or: Row[] = [{ email }]
  if (input.ip_hash) or.push({ ip_hash: input.ip_hash })
  const recent = (await service.listComplianceConsentEntries(
    {
      $or: or,
      customer_id: null,
      source: "storefront",
      created_at: { $gt: new Date(now.getTime() - limits.window_minutes * 60_000) },
    },
    { select: ["email", "ip_hash", "created_at"], take: 10_000 }
  )) as unknown as Row[]
  const wait = rateLimitWait(
    recent
      .filter((r) => r.email)
      .map((r) => ({ email: r.email, ip_hash: r.ip_hash ?? null, created_at: new Date(r.created_at) })),
    { email, ip_hash: input.ip_hash },
    limits,
    now
  )
  if (wait > 0) throw new ComplianceError("rate_limited", { minutes: wait })
}
