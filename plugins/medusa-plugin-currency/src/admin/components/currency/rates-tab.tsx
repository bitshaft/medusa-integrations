import { Alert, Button, Container, Heading, Table, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useRates, useRefreshRates } from "../../lib/currency/api"
import { errorMessage, formatDate } from "../../lib/currency/kit/format"
import { Empty, LoadingBlock } from "../../lib/currency/kit/page"
import { formatDecimal, formatPercent, formatRate } from "../../lib/currency/format"
import { RateStatusBadge, RateTimes } from "./shared"

/** "Rates": the current table with its number and date, and the rate of each store currency. */
export const RatesTab = () => {
  const { t, i18n } = useTranslation()
  const rates = useRates()
  const refresh = useRefreshRates()
  const data = rates.data

  const onRefresh = () =>
    refresh.mutate(undefined, {
      onSuccess: (result) =>
        result.status === "fresh"
          ? toast.success(t("currency.rates.refreshed", { table: result.table?.table ?? "" }))
          : toast.warning(t("currency.rates.refreshFailed"), { description: result.error ?? undefined }),
      onError: (error) => toast.error(t("currency.rates.refreshFailed"), { description: errorMessage(error) }),
    })

  if (rates.isLoading) return <LoadingBlock />
  if (!data) return null
  const base = data.base ?? "pln"

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <Heading level="h2">{t(`currency.provider.${data.provider}`)}</Heading>
              <RateStatusBadge lookup={data} />
            </div>
            {data.table ? (
              <Text size="small">
                {t("currency.rates.table", {
                  table: data.table.table,
                  date: formatDate(data.table.date, i18n.language),
                })}
              </Text>
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                {t("currency.rates.none")}
              </Text>
            )}
            <RateTimes lookup={data} />
          </div>
          {!data.demo && (
            <Button size="small" variant="secondary" isLoading={refresh.isPending} onClick={onRefresh}>
              {t("currency.rates.refresh")}
            </Button>
          )}
        </div>
        {data.status === "stale" && (
          <div className="px-6 py-4">
            <Alert variant="warning">
              {t("currency.rates.staleBody", {
                date: formatDate(data.table?.date, i18n.language),
                error: data.error ?? "",
              })}
            </Alert>
          </div>
        )}
        {data.status === "unavailable" && (
          <div className="px-6 py-4">
            <Alert variant="error">{t("currency.rates.unavailableBody", { error: data.error ?? "" })}</Alert>
          </div>
        )}
        {data.status === "demo" && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            {t("currency.rates.demoBody")}
          </Text>
        )}

        {!data.currencies.length ? (
          <div className="px-6 py-4">
            <Empty>{t("currency.rates.noCurrencies")}</Empty>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("currency.col.currency")}</Table.HeaderCell>
                <Table.HeaderCell>{t("currency.col.mode")}</Table.HeaderCell>
                <Table.HeaderCell>{t("currency.col.rate")}</Table.HeaderCell>
                <Table.HeaderCell>{t("currency.col.margin")}</Table.HeaderCell>
                <Table.HeaderCell>{t("currency.col.effective")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.currencies.map((currency) => (
                <Table.Row key={currency.code} className={currency.enabled ? "" : "opacity-60"}>
                  <Table.Cell>
                    <Text size="small" weight="plus">
                      {currency.code.toUpperCase()}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">
                      {currency.enabled ? t(`currency.mode.${currency.mode}`) : t("currency.mode.off")}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    {currency.rate ? (
                      <Text size="small">{formatRate(currency.rate.rate, currency.code, base, i18n.language)}</Text>
                    ) : (
                      <Text size="small" className="text-ui-fg-error">
                        {t(`currency.reason.${currency.reason}`)}
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">
                      {currency.rate?.mode === "api_margin" ? formatPercent(currency.rate.margin, i18n.language) : "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">
                      {currency.rate ? formatDecimal(currency.rate.effective, i18n.language) : "—"}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}
