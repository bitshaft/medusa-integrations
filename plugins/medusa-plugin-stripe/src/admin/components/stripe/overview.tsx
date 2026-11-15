import { Container, Heading, Skeleton, Table, Tabs, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useOverview } from "../../lib/stripe/api"
import { date, errorMessage, money, percent, totals } from "../../lib/stripe/format"
import { Incomplete, TAB_CLASS, Tile } from "./shared"

/** The Overview tab: 7 or 30 days of sales, fees, net, success rate, balance and payouts. */
export const Overview = () => {
  const { t, i18n } = useTranslation()
  const [days, setDays] = useState<7 | 30>(7)
  const { data, isLoading, isError, error } = useOverview(days)
  const lang = i18n.language
  const cut = data?.truncated.length ? <Incomplete data={data} compact /> : undefined
  const charges = data?.truncated.includes("charges") ? <Incomplete data={data} compact /> : undefined
  const transactions = data?.truncated.includes("balance_transactions") ? <Incomplete data={data} compact /> : undefined

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h2">{t("stripe.overview.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("stripe.overview.hint")}
          </Text>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30)}>
          <Tabs.List>
            <Tabs.Trigger className={TAB_CLASS} value="7">
              {t("stripe.days", { count: 7 })}
            </Tabs.Trigger>
            <Tabs.Trigger className={TAB_CLASS} value="30">
              {t("stripe.days", { count: 30 })}
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs>
      </div>
      {isError && <Text className="text-ui-fg-error">{errorMessage(error)}</Text>}
      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Incomplete data={data} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={t("stripe.overview.turnover")} value={totals(data.turnover, lang)} warn={transactions} />
            <Tile label={t("stripe.overview.fees")} value={totals(data.fees, lang)} warn={transactions} />
            <Tile label={t("stripe.overview.net")} value={totals(data.net, lang)} warn={transactions} />
            <Tile label={t("stripe.overview.refunds")} value={totals(data.refunds, lang)} warn={transactions} />
            <Tile
              label={t("stripe.overview.success")}
              value={percent(data.success.per_mille, lang)}
              hint={t("stripe.overview.successHint", { ok: data.success.succeeded, all: data.success.attempts })}
              tone={data.success.per_mille !== null && data.success.per_mille < 800 ? "warn" : undefined}
              warn={charges}
            />
            <Tile
              label={t("stripe.overview.disputes")}
              value={data.disputes.open}
              hint={totals(data.disputes.amounts, lang)}
              tone={data.disputes.open ? "bad" : undefined}
              warn={data.truncated.includes("disputes") ? cut : undefined}
            />
            <Tile
              label={t("stripe.overview.balance")}
              value={data.balance ? totals(data.balance.available, lang) : "—"}
              hint={
                data.balance ? t("stripe.overview.pending", { amount: totals(data.balance.pending, lang) }) : undefined
              }
            />
            <Tile
              label={t("stripe.overview.nextPayout")}
              value={data.next_payout ? money(data.next_payout.amount, data.next_payout.currency, lang) : "—"}
              hint={data.next_payout ? date(data.next_payout.arrival_date, lang) : t("stripe.overview.noPayout")}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <div className="flex items-center gap-x-2">
              <Text size="small" weight="plus">
                {t("stripe.overview.byMethod")}
              </Text>
              {charges}
            </div>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("stripe.payments.method")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("stripe.overview.attempts")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("stripe.overview.succeeded")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("stripe.overview.rate")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("stripe.overview.turnover")}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.methods.map((m) => (
                  <Table.Row key={m.method}>
                    <Table.Cell>{t(`stripe.methods.${m.method}`)}</Table.Cell>
                    <Table.Cell className="text-right">{m.attempts}</Table.Cell>
                    <Table.Cell className="text-right">{m.succeeded}</Table.Cell>
                    <Table.Cell className="text-right">
                      {percent(m.attempts ? Math.round((m.succeeded * 1000) / m.attempts) : null, lang)}
                    </Table.Cell>
                    <Table.Cell className="text-right">{totals(m.amounts, lang)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </>
      )}
    </Container>
  )
}
