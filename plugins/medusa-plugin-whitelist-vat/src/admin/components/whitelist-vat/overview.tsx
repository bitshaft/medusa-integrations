import { ArrowPath } from "@medusajs/icons"
import { Badge, Container, Heading, IconButton, Input, Skeleton, Table, Tabs, Text, toast, Tooltip } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  type Subject,
  type SubjectFilter,
  useChecks,
  useRefreshSubject,
  useSubjects,
  type WhitelistVatStatus,
} from "../../lib/whitelist-vat/api"
import { errorMessage, formatDateTime } from "../../lib/whitelist-vat/kit/format"
import { OutcomeBadge, Pager, TaxId, VerdictBadge } from "./shared"

type EnabledStatus = Extract<WhitelistVatStatus, { enabled: true }>

const FILTERS: SubjectFilter[] = ["all", "active", "exempt", "problem", "stale"]
const PAGE = 20

/** Numbers at a glance, the businesses verified so far and the full history. */
export const Overview = ({ status }: { status: EnabledStatus }) => {
  const { t } = useTranslation()
  const { mf } = status.registers
  const tiles: Array<[string, string | number]> = [
    [t("whitelist-vat.tiles.all"), status.counts.all],
    [t("whitelist-vat.tiles.active"), status.counts.active],
    [t("whitelist-vat.tiles.exempt"), status.counts.exempt],
    [t("whitelist-vat.tiles.problem"), status.counts.problem],
    [t("whitelist-vat.tiles.stale"), status.counts.stale],
    ...(mf.enabled
      ? [[t("whitelist-vat.tiles.quota"), `${mf.requests_today} / ${mf.daily_limit}`] as [string, string]]
      : []),
  ]
  return (
    <div className="flex flex-col gap-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value]) => (
          <Container key={label} className="px-4 py-3">
            <Text size="xsmall" className="text-ui-fg-subtle">
              {label}
            </Text>
            <Text size="xlarge" weight="plus">
              {value}
            </Text>
          </Container>
        ))}
      </div>
      <Subjects counts={status.counts} />
      <History />
    </div>
  )
}

const Subjects = ({ counts }: { counts: Record<SubjectFilter, number> }) => {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState<SubjectFilter>("all")
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const { data, isLoading, isError } = useSubjects({ q: search.trim(), filter, limit: PAGE, offset }, true)
  const refresh = useRefreshSubject()

  const onRefresh = (subject: Subject) =>
    refresh.mutate(subject.id, {
      onSuccess: ({ verification }) =>
        toast.info(
          t("whitelist-vat.subjects.rechecked", {
            number: subject.number,
            status: t(`whitelist-vat.status.${verification.status}`),
          })
        ),
      onError: (error) =>
        toast.error(t("whitelist-vat.subjects.recheckFailed", { number: subject.number, error: errorMessage(error) })),
    })

  const subjects = data?.subjects ?? []

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">{t("whitelist-vat.subjects.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("whitelist-vat.subjects.subtitle")}
          </Text>
        </div>
        <div className="w-64">
          <Input
            size="small"
            type="search"
            placeholder={t("whitelist-vat.subjects.search")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
          />
        </div>
      </div>

      <div className="px-6 py-3">
        <Tabs
          value={filter}
          onValueChange={(value) => {
            setFilter(value as SubjectFilter)
            setOffset(0)
          }}
        >
          <Tabs.List>
            {FILTERS.map((value) => (
              <Tabs.Trigger key={value} value={value}>
                {t(`whitelist-vat.subjects.filters.${value}`)}
                <span className="text-ui-fg-muted ml-1.5">{counts[value]}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
      </div>

      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {t("whitelist-vat.loadError")}
        </Text>
      )}
      {!isLoading && !isError && !subjects.length && (
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          {filter === "all" && !search.trim()
            ? t("whitelist-vat.subjects.empty")
            : t("whitelist-vat.subjects.emptyFiltered")}
        </Text>
      )}

      {subjects.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("whitelist-vat.subjects.number")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.subjects.name")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.subjects.status")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("whitelist-vat.subjects.accounts")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.subjects.checked")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {subjects.map((subject) => (
              <Table.Row key={subject.id}>
                <Table.Cell className="align-top py-3">
                  <TaxId number={subject.number} />
                  {subject.customer_id && (
                    <div>
                      <Link
                        to={`/customers/${subject.customer_id}`}
                        className="text-ui-fg-interactive txt-compact-xsmall hover:underline"
                      >
                        {t("whitelist-vat.subjects.customer")}
                      </Link>
                    </div>
                  )}
                </Table.Cell>
                <Table.Cell className="max-w-[420px] align-top py-3">
                  <Text size="small" weight="plus" className="whitespace-normal break-words">
                    {subject.name ?? "—"}
                  </Text>
                  {subject.address && (
                    <Text size="small" className="text-ui-fg-subtle whitespace-normal break-words">
                      {subject.address}
                    </Text>
                  )}
                  {(subject.company?.regon || subject.company?.krs) && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {[
                        subject.company.krs ? `KRS: ${subject.company.krs}` : null,
                        subject.company.regon ? `REGON: ${subject.company.regon}` : null,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell className="align-top py-3">
                  <VerdictBadge status={subject.status} stale={subject.stale} />
                </Table.Cell>
                <Table.Cell className="text-right align-top py-3">
                  <Text size="small">{subject.kind === "nip" ? subject.bank_account_count : "—"}</Text>
                </Table.Cell>
                <Table.Cell className="align-top py-3">
                  <Text size="small" className="text-ui-fg-subtle">
                    {subject.checked_at
                      ? formatDateTime(subject.checked_at, i18n.language)
                      : t("whitelist-vat.subjects.never")}
                  </Text>
                </Table.Cell>
                <Table.Cell className="text-right align-top py-3">
                  <Tooltip content={t("whitelist-vat.subjects.recheck")}>
                    <IconButton
                      size="small"
                      variant="transparent"
                      aria-label={t("whitelist-vat.subjects.recheck")}
                      isLoading={refresh.isPending && refresh.variables === subject.id}
                      onClick={() => onRefresh(subject)}
                    >
                      <ArrowPath />
                    </IconButton>
                  </Tooltip>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Pager offset={offset} limit={PAGE} count={data?.count ?? 0} onChange={setOffset} />
    </Container>
  )
}

const History = () => {
  const { t, i18n } = useTranslation()
  const [offset, setOffset] = useState(0)
  const { data, isLoading, isError } = useChecks({ limit: PAGE, offset }, true)
  const checks = data?.checks ?? []

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("whitelist-vat.history.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("whitelist-vat.history.subtitle")}
        </Text>
      </div>
      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {t("whitelist-vat.loadError")}
        </Text>
      )}
      {!isLoading && !isError && !checks.length && (
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          {t("whitelist-vat.history.empty")}
        </Text>
      )}
      {checks.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("whitelist-vat.history.when")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.history.number")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.history.source")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.history.outcome")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.history.proof")}</Table.HeaderCell>
              <Table.HeaderCell>{t("whitelist-vat.history.order")}</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {checks.map((check) => (
              <Table.Row key={check.id}>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {formatDateTime(check.checked_at, i18n.language)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="font-mono">
                    {check.number}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{t(`whitelist-vat.source.${check.source}`)}</Text>
                </Table.Cell>
                <Table.Cell className="max-w-[320px] py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <OutcomeBadge outcome={check.outcome} />
                    {check.from_cache && (
                      <Tooltip content={t("whitelist-vat.fromCacheHint")}>
                        <Badge size="2xsmall">{t("whitelist-vat.fromCache")}</Badge>
                      </Tooltip>
                    )}
                  </div>
                  {check.error && (
                    <Text size="xsmall" className="text-ui-fg-subtle whitespace-normal break-words">
                      {check.error}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="xsmall" className="text-ui-fg-subtle font-mono">
                    {check.request_id ?? "—"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {check.order_id ? (
                    <Link
                      to={`/orders/${check.order_id}`}
                      className="text-ui-fg-interactive txt-compact-small hover:underline"
                    >
                      {t("whitelist-vat.history.order")}
                    </Link>
                  ) : (
                    <Text size="small" className="text-ui-fg-muted">
                      —
                    </Text>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Pager offset={offset} limit={PAGE} count={data?.count ?? 0} onChange={setOffset} />
    </Container>
  )
}
