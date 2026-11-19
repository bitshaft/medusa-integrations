import { TriangleRightMini } from "@medusajs/icons"
import { Badge, Container, Drawer, Heading, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { type FillRun, useRun, useRuns } from "../../lib/currency/api"
import { formatDate, formatDateTime } from "../../lib/currency/kit/format"
import { Empty, LoadingBlock, Pager } from "../../lib/currency/kit/page"
import { formatMoney, formatPercent, formatRate } from "../../lib/currency/format"

const PAGE = 20

/** "History": every fill, newest first; a row opens what it wrote. */
export const HistoryTab = ({ productId }: { productId?: string }) => {
  const { t, i18n } = useTranslation()
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const runs = useRuns({ limit: PAGE, offset, product_id: productId })
  const rows = runs.data?.runs ?? []

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("currency.history.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("currency.history.subtitle")}
        </Text>
      </div>
      {runs.isLoading && <LoadingBlock />}
      {!runs.isLoading && !rows.length && (
        <div className="px-6 py-4">
          <Empty>{t("currency.history.empty")}</Empty>
        </div>
      )}
      {rows.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("currency.history.when")}</Table.HeaderCell>
              <Table.HeaderCell>{t("currency.history.who")}</Table.HeaderCell>
              <Table.HeaderCell>{t("currency.history.scope")}</Table.HeaderCell>
              <Table.HeaderCell>{t("currency.history.rates")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("currency.history.result")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((run) => (
              <Table.Row
                key={run.id}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => setOpen(run.id)}
                onKeyDown={(event) => event.key === "Enter" && setOpen(run.id)}
              >
                <Table.Cell className="whitespace-nowrap">
                  <Text size="small">{formatDateTime(run.created_at, i18n.language)}</Text>
                  {run.demo && (
                    <Badge size="2xsmall" color="orange">
                      {t("currency.demo")}
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{run.actor_name ?? "—"}</Text>
                </Table.Cell>
                <Table.Cell className="max-w-[240px]">
                  <ScopeText run={run} />
                </Table.Cell>
                <Table.Cell>
                  <RunRates run={run} />
                </Table.Cell>
                <Table.Cell className="text-right whitespace-nowrap">
                  <Text size="small">
                    {t("currency.history.counts", { add: run.added, overwrite: run.overwritten, skip: run.skipped })}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <TriangleRightMini className="text-ui-fg-muted" />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Pager offset={offset} limit={PAGE} count={runs.data?.count ?? 0} onChange={setOffset} />
      <RunDrawer id={open} onClose={() => setOpen(null)} />
    </Container>
  )
}

const ScopeText = ({ run }: { run: FillRun }) => {
  const { t } = useTranslation()
  const labels = run.scope.labels ?? run.products.map((p) => p.title)
  return (
    <div className="flex flex-col">
      <Text size="small">
        {t(`currency.scope.${run.scope.kind}`)} · {run.run_options.currencies.map((c) => c.toUpperCase()).join(", ")}
      </Text>
      <Text size="xsmall" className="text-ui-fg-subtle truncate">
        {labels.slice(0, 3).join(", ")}
        {run.products.length > 3 ? ` +${run.products.length - 3}` : ""}
      </Text>
      <Text size="xsmall" className="text-ui-fg-muted">
        {[
          run.run_options.overwrite ? t("currency.fill.overwrite") : t("currency.fill.onlyEmpty"),
          run.run_options.price_lists ? t("currency.fill.priceLists") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </div>
  )
}

const RunRates = ({ run }: { run: FillRun }) => {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex flex-col">
      {Object.entries(run.rates).map(([code, rate]) => (
        <Text key={code} size="xsmall" className="whitespace-nowrap">
          {formatRate(rate.rate, code, run.base_currency, i18n.language)}
          {rate.mode === "api_margin" ? ` ${formatPercent(rate.margin, i18n.language)}` : ""}
          {" · "}
          {rate.table
            ? t("currency.rate.source", { table: rate.table, date: formatDate(rate.date, i18n.language) })
            : t("currency.rate.fixed")}
          {rate.stale ? ` · ${t("currency.warning.stale_rate")}` : ""}
        </Text>
      ))}
    </div>
  )
}

const RunDrawer = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { t, i18n } = useTranslation()
  const run = useRun(id)
  const data = run.data
  return (
    <Drawer open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("currency.history.detail")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          {!data ? (
            <LoadingBlock />
          ) : (
            <>
              <div className="flex flex-col gap-y-1">
                <Text size="small">
                  {formatDateTime(data.run.created_at, i18n.language)} · {data.run.actor_name ?? "—"}
                </Text>
                <ScopeText run={data.run} />
                <RunRates run={data.run} />
                <Text size="small">
                  {t("currency.history.counts", {
                    add: data.run.added,
                    overwrite: data.run.overwritten,
                    skip: data.run.skipped,
                  })}
                </Text>
                {Object.entries(data.run.skipped_by).map(([reason, count]) => (
                  <Text key={reason} size="xsmall" className="text-ui-fg-subtle">
                    {t(`currency.reason.${reason}`)}: {count}
                  </Text>
                ))}
                {data.run.demo && (
                  <Text size="xsmall" className="text-ui-tag-orange-text">
                    {t("currency.history.demoRun")}
                  </Text>
                )}
              </div>
              {data.prices.length > 0 && (
                <div className="flex flex-col divide-y rounded-md border">
                  {data.prices.map((price) => (
                    <div key={price.id} className="flex items-center justify-between gap-x-3 px-3 py-2">
                      <Text size="xsmall" className="text-ui-fg-subtle truncate">
                        {data.run.products.find((p) => p.id === price.product_id)?.title ?? price.product_id} ·{" "}
                        {price.currency_code.toUpperCase()}
                      </Text>
                      <Text size="xsmall" className="whitespace-nowrap">
                        {price.previous_amount
                          ? `${formatMoney(price.previous_amount, price.currency_code, i18n.language)} → `
                          : ""}
                        {formatMoney(price.amount, price.currency_code, i18n.language)}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
