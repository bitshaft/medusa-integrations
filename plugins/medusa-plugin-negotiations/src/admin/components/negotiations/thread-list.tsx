import { MagnifyingGlass } from "@medusajs/icons"
import { Button, Input, Skeleton, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { type ListFilters, type Status, type Thread, useThreads } from "../../lib/negotiations/api"
import { customerName, money, relative } from "../../lib/negotiations/format"
import { DemoBadge, Empty, PriceWithDiscount, productLabel, StatusLabel, TurnDot } from "./shared"

const STATUSES: Status[] = ["open", "countered", "accepted", "rejected", "expired", "withdrawn"]
const PAGE = 20

/**
 * Threads with status filters (and their counts), search and paging. Used on
 * the main page and, filtered by customer or product, in the widgets.
 */
export const ThreadList = ({
  fixed = {},
  compact = false,
  showOldest = false,
}: {
  fixed?: Pick<ListFilters, "customer_id" | "product_id">
  compact?: boolean
  showOldest?: boolean
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status | "waiting" | "all">("all")
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const filters: ListFilters = {
    ...fixed,
    status: status === "all" || status === "waiting" ? undefined : status,
    waiting: status === "waiting" || undefined,
    q: q.trim() || undefined,
    limit: compact ? 5 : PAGE,
    offset,
  }
  const { data, isLoading } = useThreads(filters)
  const rows = data?.negotiations ?? []
  const lang = i18n.language
  const counts = data?.counts ?? {}
  const all = STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0)

  const chip = (value: typeof status, label: string, count: number | undefined) => (
    <Button
      key={value}
      size="small"
      variant={status === value ? "primary" : "secondary"}
      onClick={() => {
        setStatus(value)
        setOffset(0)
      }}
    >
      {label}
      <span className="txt-compact-xsmall opacity-70">{count ?? 0}</span>
    </Button>
  )

  return (
    <div className="flex flex-col gap-y-3">
      {!compact && (
        <div className="flex flex-col gap-3 px-6 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {chip("all", t("negotiations.list.all"), all)}
            {chip("waiting", t("negotiations.list.waiting"), counts.waiting)}
            {STATUSES.map((s) => chip(s, t(`negotiations.status.${s}`), counts[s]))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full lg:w-72">
              <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-muted" />
              <Input
                size="small"
                className="pl-8"
                placeholder={t("negotiations.list.search")}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setOffset(0)
                }}
              />
            </div>
            {showOldest && (
              <Button
                size="small"
                variant="secondary"
                disabled={!data?.oldest_waiting_id}
                onClick={() => data?.oldest_waiting_id && navigate(`/negotiations/${data.oldest_waiting_id}`)}
              >
                {t("negotiations.list.answerOldest")}
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="mx-6 h-32" />
      ) : !rows.length ? (
        <div className={compact ? "" : "px-6 pb-6"}>
          <Empty>{q ? t("negotiations.list.noResults") : t("negotiations.list.empty")}</Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("negotiations.list.thread")}</Table.HeaderCell>
                {!fixed.customer_id && <Table.HeaderCell>{t("negotiations.list.customer")}</Table.HeaderCell>}
                <Table.HeaderCell>{t("negotiations.list.product")}</Table.HeaderCell>
                {!compact && (
                  <Table.HeaderCell className="text-right">{t("negotiations.list.quantity")}</Table.HeaderCell>
                )}
                <Table.HeaderCell>{t("negotiations.list.price")}</Table.HeaderCell>
                {!compact && <Table.HeaderCell className="text-right">{t("negotiations.list.value")}</Table.HeaderCell>}
                <Table.HeaderCell>{t("negotiations.list.status")}</Table.HeaderCell>
                <Table.HeaderCell>{t("negotiations.list.activity")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((thread) => (
                <Row key={thread.id} thread={thread} compact={compact} hideCustomer={!!fixed.customer_id} lang={lang} />
              ))}
            </Table.Body>
          </Table>
          {!compact && (data?.count ?? 0) > PAGE && (
            <Table.Pagination
              count={data?.count ?? 0}
              pageSize={PAGE}
              pageIndex={Math.floor(offset / PAGE)}
              pageCount={Math.ceil((data?.count ?? 0) / PAGE)}
              canPreviousPage={offset > 0}
              canNextPage={offset + PAGE < (data?.count ?? 0)}
              previousPage={() => setOffset(Math.max(0, offset - PAGE))}
              nextPage={() => setOffset(offset + PAGE)}
            />
          )}
        </div>
      )}
    </div>
  )
}

const Row = ({
  thread,
  compact,
  hideCustomer,
  lang,
}: {
  thread: Thread
  compact: boolean
  hideCustomer: boolean
  lang: string
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const unit =
    thread.kind === "product" && thread.quantity_total ? Math.floor(thread.current_price / thread.quantity_total) : null
  return (
    <Table.Row className="cursor-pointer" onClick={() => navigate(`/negotiations/${thread.id}`)}>
      <Table.Cell>
        <div className="flex items-center gap-x-2">
          <TurnDot thread={thread} />
          <Text size="small" weight="plus" className="font-mono">
            {thread.number}
          </Text>
          {thread.is_demo && <DemoBadge />}
        </div>
      </Table.Cell>
      {!hideCustomer && (
        <Table.Cell>
          <Text size="small">{customerName(thread.customer)}</Text>
        </Table.Cell>
      )}
      <Table.Cell>
        <div className="flex flex-col">
          <Text size="small">{productLabel(thread, t("negotiations.list.wholeCart"))}</Text>
          {thread.kind === "cart" ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("negotiations.list.lines", { count: thread.lines.length })}
            </Text>
          ) : (
            thread.lines[0]?.sku && (
              <Text size="xsmall" className="font-mono text-ui-fg-subtle">
                {thread.lines[0].sku}
              </Text>
            )
          )}
        </div>
      </Table.Cell>
      {!compact && <Table.Cell className="text-right">{thread.quantity_total}</Table.Cell>}
      <Table.Cell>
        <PriceWithDiscount
          amount={unit ?? thread.current_price}
          bp={thread.discount_bp}
          currency={thread.currency_code}
        />
      </Table.Cell>
      {!compact && (
        <Table.Cell className="text-right">{money(thread.current_price, thread.currency_code, lang)}</Table.Cell>
      )}
      <Table.Cell>
        <StatusLabel status={thread.status} />
      </Table.Cell>
      <Table.Cell>
        <div className="flex flex-col">
          <Text size="small">{relative(thread.last_activity_at, lang)}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t(`negotiations.author.${thread.last_author}`)}
          </Text>
        </div>
      </Table.Cell>
    </Table.Row>
  )
}
