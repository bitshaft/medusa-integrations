import { ArrowDownTray } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, Heading, Skeleton, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { csvUrl, usePayout, usePayouts } from "../../lib/stripe/api"
import { date, dateTime, errorMessage, money } from "../../lib/stripe/format"
import { Filter } from "./payments"
import { Empty, ExternalLink, Incomplete, OrderLink, StripeStatus } from "./shared"

/** The Payouts tab: payouts by date; a payout opens the transactions, refunds and fees in it. */
export const Payouts = ({ demo }: { demo: boolean }) => {
  const { t, i18n } = useTranslation()
  const [days, setDays] = useState(90)
  const [selected, setSelected] = useState<string | null>(null)
  const { data, isLoading, isError, error } = usePayouts(days)
  const lang = i18n.language

  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{t("stripe.payouts.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("stripe.payouts.hint")}
          </Text>
        </div>
        <Filter
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={["30", "90", "365"].map((d) => [d, t("stripe.days", { count: Number(d) })])}
        />
      </div>
      {isError && <Text className="text-ui-fg-error">{errorMessage(error)}</Text>}
      <Incomplete data={data} />
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !data?.payouts.length ? (
        <Empty>{t("stripe.payouts.empty")}</Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("stripe.payouts.arrival")}</Table.HeaderCell>
              <Table.HeaderCell>{t("stripe.payments.status")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("stripe.amount")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.payouts.map((p) => (
              <Table.Row key={p.id} className="cursor-pointer" onClick={() => setSelected(p.id)}>
                <Table.Cell>{date(p.arrival_date, lang)}</Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-x-2">
                    <StripeStatus status={p.status} />
                    {!p.automatic && <Badge size="2xsmall">{t("stripe.payouts.manual")}</Badge>}
                  </div>
                </Table.Cell>
                <Table.Cell className="text-right">{money(p.amount, p.currency, lang)}</Table.Cell>
                <Table.Cell className="text-right">
                  <ExternalLink href={p.dashboard_url}>Stripe</ExternalLink>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <PayoutDrawer id={selected} demo={demo} onClose={() => setSelected(null)} />
    </Container>
  )
}

const PayoutDrawer = ({ id, demo, onClose }: { id: string | null; demo: boolean; onClose: () => void }) => {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError, error } = usePayout(id)
  const lang = i18n.language
  const missing = (data?.items ?? []).filter((i) => i.missing_order).length

  return (
    <Drawer open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content className="max-w-3xl">
        <Drawer.Header>
          <Drawer.Title>
            {data
              ? t("stripe.payouts.detailTitle", {
                  amount: money(data.payout.amount, data.payout.currency, lang),
                  date: date(data.payout.arrival_date, lang),
                })
              : t("stripe.payouts.title")}
          </Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-3 overflow-y-auto">
          {isError && <Text className="text-ui-fg-error">{errorMessage(error)}</Text>}
          {isLoading || !data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="small" className="text-ui-fg-subtle">
                  {data.payout.automatic
                    ? t("stripe.payouts.items", { count: data.items.length })
                    : t("stripe.payouts.manualHint")}
                </Text>
                <Button size="small" variant="secondary" asChild>
                  <a href={csvUrl(`/payouts/${data.payout.id}`)} download>
                    <ArrowDownTray />
                    {t("stripe.csv")}
                  </a>
                </Button>
              </div>
              <Incomplete data={data} />
              {missing > 0 && (
                <Badge color="red" className="w-fit">
                  {t("stripe.payouts.missingOrders", { count: missing })}
                </Badge>
              )}
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("stripe.date")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("stripe.payouts.type")}</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">{t("stripe.amount")}</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">{t("stripe.fee")}</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">{t("stripe.net")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("stripe.order")}</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.items.map((i) => (
                    <Table.Row
                      key={i.id}
                      className={i.missing_order ? "bg-ui-tag-red-bg hover:bg-ui-tag-red-bg-hover" : undefined}
                    >
                      <Table.Cell>{dateTime(i.created, lang)}</Table.Cell>
                      <Table.Cell>{t(`stripe.txn.${i.type}`, { defaultValue: i.type.replace(/_/g, " ") })}</Table.Cell>
                      <Table.Cell className="text-right">{money(i.amount, i.currency, lang)}</Table.Cell>
                      <Table.Cell className="text-right">{money(i.fee, i.currency, lang)}</Table.Cell>
                      <Table.Cell className="text-right">{money(i.net, i.currency, lang)}</Table.Cell>
                      <Table.Cell>
                        {i.missing_order ? (
                          <Badge size="2xsmall" color="red">
                            {t("stripe.payments.noOrder")}
                          </Badge>
                        ) : (
                          <OrderLink order={i.order} demo={demo} />
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
