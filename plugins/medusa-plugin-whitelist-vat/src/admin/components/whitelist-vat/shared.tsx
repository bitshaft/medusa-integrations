import { ExclamationCircle } from "@medusajs/icons"
import { Badge, Button, Copy, StatusBadge, Text, Tooltip } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { Company, Outcome, Source, SourceState, Status } from "../../lib/whitelist-vat/api"
import { formatDateTime } from "../../lib/whitelist-vat/kit/format"

type Color = "green" | "red" | "orange" | "grey" | "blue"

const STATUS_COLORS: Record<Status, Color> = {
  active: "green",
  exempt: "green",
  valid: "green",
  unregistered: "orange",
  inactive: "red",
  invalid: "red",
  not_found: "red",
  unverified: "grey",
}

const OUTCOME_COLORS: Record<Outcome, Color> = {
  active: "green",
  exempt: "green",
  valid: "green",
  found: "green",
  unregistered: "orange",
  inactive: "red",
  invalid: "red",
  not_found: "orange",
  unavailable: "grey",
}

/** The plugin's verdict, with an explanation on hover. */
export const VerdictBadge = ({ status, stale }: { status: Status; stale?: boolean }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Tooltip content={t(`whitelist-vat.statusHint.${status}`)}>
        <StatusBadge color={STATUS_COLORS[status]}>{t(`whitelist-vat.status.${status}`)}</StatusBadge>
      </Tooltip>
      {stale && (
        <Tooltip content={t("whitelist-vat.staleHint")}>
          <Badge size="2xsmall" color="orange">
            {t("whitelist-vat.stale")}
          </Badge>
        </Tooltip>
      )}
    </div>
  )
}

/** What one register answered. */
export const OutcomeBadge = ({ outcome }: { outcome: Outcome }) => {
  const { t } = useTranslation()
  return (
    <Badge size="2xsmall" color={OUTCOME_COLORS[outcome]}>
      {t(`whitelist-vat.outcome.${outcome}`)}
    </Badge>
  )
}

/** A tax ID in monospace with a copy button. */
export const TaxId = ({ number }: { number: string }) => (
  <span className="inline-flex items-center gap-x-1">
    <Text size="small" className="font-mono">
      {number}
    </Text>
    <Copy content={number} />
  </span>
)

const SOURCE_ORDER: Source[] = ["mf", "gus", "vies"]

/** One line per register: its answer, when, its own ID of the answer, or why it could not be asked. */
export const SourceList = ({ sources }: { sources: Partial<Record<Source, SourceState>> }) => {
  const { t, i18n } = useTranslation()
  const entries = SOURCE_ORDER.filter((source) => sources[source]).map((source) => [source, sources[source]!] as const)
  if (!entries.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        {t("whitelist-vat.lookup.noRegisters")}
      </Text>
    )
  }
  return (
    <div className="flex flex-col gap-y-2">
      {entries.map(([source, state]) => (
        <div key={source} className="flex flex-col gap-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2">
            <Text size="small" weight="plus">
              {t(`whitelist-vat.source.${source}`)}
            </Text>
            <OutcomeBadge outcome={state.outcome} />
            <Text size="xsmall" className="text-ui-fg-subtle">
              {formatDateTime(state.checked_at, i18n.language)}
            </Text>
          </div>
          {state.request_id && (
            <span className="inline-flex items-center gap-x-1">
              <Text size="xsmall" className="text-ui-fg-subtle font-mono">
                {state.request_id}
              </Text>
              <Copy content={state.request_id} />
            </span>
          )}
          {state.error && (
            <Text size="xsmall" className="text-ui-fg-subtle whitespace-normal break-words">
              {state.error}
            </Text>
          )}
        </div>
      ))}
    </div>
  )
}

/** `61109010140000071219812874` → `61 1090 1014 0000 0712 1981 2874`. */
export function formatAccount(account: string): string {
  return /^\d{26}$/.test(account)
    ? `${account.slice(0, 2)} ${account
        .slice(2)
        .replace(/(.{4})/g, "$1 ")
        .trim()}`
    : account
}

/** Name, address and register numbers of a business; optionally its white list bank accounts. */
export const CompanyDetails = ({ company, accounts = false }: { company: Company; accounts?: boolean }) => {
  const { t } = useTranslation()
  const rows: Array<[string, ReactNode]> = [
    [t("whitelist-vat.lookup.name"), company.name],
    [t("whitelist-vat.lookup.address"), company.address],
    [t("whitelist-vat.lookup.regon"), company.regon],
    [t("whitelist-vat.lookup.krs"), company.krs],
    [
      t("whitelist-vat.lookup.legalForm"),
      company.legal_form
        ? t(`whitelist-vat.lookup.legalForms.${company.legal_form}`, { defaultValue: company.legal_form })
        : null,
    ],
    [t("whitelist-vat.lookup.registeredAt"), company.registered_at],
  ]
  return (
    <div className="flex flex-col gap-y-1">
      {rows
        .filter(([, value]) => Boolean(value))
        .map(([label, value]) => (
          <div key={label} className="grid grid-cols-3 gap-x-4">
            <Text size="small" className="text-ui-fg-subtle">
              {label}
            </Text>
            <Text size="small" className="col-span-2 whitespace-normal break-words">
              {value}
            </Text>
          </div>
        ))}
      {accounts && (
        <div className="grid grid-cols-3 gap-x-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("whitelist-vat.lookup.bankAccounts")}
          </Text>
          <div className="col-span-2 flex flex-col gap-y-0.5">
            {company.bank_accounts?.length ? (
              company.bank_accounts.map((account) => (
                <span key={account} className="inline-flex items-center gap-x-1">
                  <Text size="small" className="font-mono">
                    {formatAccount(account)}
                  </Text>
                  <Copy content={account} />
                </span>
              ))
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                {t("whitelist-vat.lookup.noBankAccounts")}
              </Text>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Previous / next buttons with "1–20 of 57". Renders nothing when everything fits on one page. */
export const Pager = ({
  offset,
  limit,
  count,
  onChange,
}: {
  offset: number
  limit: number
  count: number
  onChange: (offset: number) => void
}) => {
  const { t } = useTranslation()
  if (count <= limit) {
    return null
  }
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <Text size="small" className="text-ui-fg-subtle">
        {t("whitelist-vat.paging.range", { from: offset + 1, to: Math.min(offset + limit, count), count })}
      </Text>
      <div className="flex items-center gap-x-2">
        <Button
          size="small"
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          {t("whitelist-vat.paging.previous")}
        </Button>
        <Button
          size="small"
          variant="secondary"
          disabled={offset + limit >= count}
          onClick={() => onChange(offset + limit)}
        >
          {t("whitelist-vat.paging.next")}
        </Button>
      </div>
    </div>
  )
}

/** Shown above the page in demo mode: GUS answers are sample data. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="flex items-start gap-x-3 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3"
    >
      <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
      <div>
        <Text size="small" weight="plus" className="text-ui-tag-orange-text">
          {t("whitelist-vat.demo.title")}
        </Text>
        <Text size="xsmall" className="text-ui-tag-orange-text">
          {t("whitelist-vat.demo.body")}
        </Text>
      </div>
    </div>
  )
}
