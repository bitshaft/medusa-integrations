import { ArrowDownTray } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Select, Skeleton, Table, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { csvUrl, type MethodGroup, type PaymentFilters, usePayments } from "../../lib/stripe/api"
import { dateTime, errorMessage, money } from "../../lib/stripe/format"
import { Empty, ExternalLink, Incomplete, Note, OrderLink, Risk, StripeStatus } from "./shared"

const ALL = "__all__"
const METHODS: MethodGroup[] = ["card", "blik", "p24", "apple_pay", "google_pay", "other"]
const STATUSES = [
  "succeeded",
  "requires_capture",
  "requires_payment_method",
  "requires_action",
  "processing",
  "canceled",
]

/** The Payments tab: every PaymentIntent with method, outcome, Radar, fee and the Medusa order. */
export const Payments = ({ demo, graceMinutes }: { demo: boolean; graceMinutes: number }) => {
  const { t, i18n } = useTranslation()
  const [filters, setFilters] = useState<PaymentFilters>({ days: 7 })
  const { data, isLoading, isError, error } = usePayments(filters)
  const lang = i18n.language
  const currencies = useMemo(() => [...new Set((data?.payments ?? []).map((p) => p.currency))], [data])
  const orphans = (data?.payments ?? []).filter((p) => p.orphan).length
  const set = (patch: Partial<PaymentFilters>) => setFilters({ ...filters, ...patch })

  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{t("stripe.payments.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("stripe.payments.hint", { minutes: graceMinutes })}
          </Text>
        </div>
        <Button size="small" variant="secondary" asChild>
          <a href={csvUrl("/payments", filters as Record<string, unknown>)} download>
            <ArrowDownTray />
            {t("stripe.csv")}
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Filter
          value={String(filters.days)}
          onChange={(v) => set({ days: Number(v) })}
          options={["1", "7", "30", "90"].map((d) => [d, t("stripe.days", { count: Number(d) })])}
        />
        <Filter
          value={filters.method ?? ALL}
          onChange={(v) => set({ method: v === ALL ? undefined : (v as MethodGroup) })}
          options={[
            [ALL, t("stripe.payments.allMethods")],
            ...METHODS.map((m) => [m, t(`stripe.methods.${m}`)] as [string, string]),
          ]}
        />
        <Filter
          value={filters.status ?? ALL}
          onChange={(v) => set({ status: v === ALL ? undefined : v })}
          options={[
            [ALL, t("stripe.payments.allStatuses")],
            ...STATUSES.map((s) => [s, t(`stripe.status.${s}`)] as [string, string]),
          ]}
        />
        <Filter
          value={filters.currency ?? ALL}
          onChange={(v) => set({ currency: v === ALL ? undefined : v })}
          options={[
            [ALL, t("stripe.payments.allCurrencies")],
            ...currencies.map((c) => [c, c.toUpperCase()] as [string, string]),
          ]}
        />
      </div>
      {isError && <Text className="text-ui-fg-error">{errorMessage(error)}</Text>}
      <Incomplete data={data} />
      {orphans > 0 && (
        <div className="rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg px-3 py-2">
          <Text size="small" className="text-ui-tag-red-text">
            {t("stripe.payments.orphans", { count: orphans })}
          </Text>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data?.payments.length ? (
        <Empty>{t("stripe.payments.empty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("stripe.date")}</Table.HeaderCell>
                <Table.HeaderCell>{t("stripe.payments.method")}</Table.HeaderCell>
                <Table.HeaderCell>{t("stripe.payments.status")}</Table.HeaderCell>
                <Table.HeaderCell>{t("stripe.payments.radar")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("stripe.amount")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("stripe.fee")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("stripe.net")}</Table.HeaderCell>
                <Table.HeaderCell>{t("stripe.order")}</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.payments.map((p) => (
                <Table.Row
                  key={p.id}
                  className={p.orphan ? "bg-ui-tag-red-bg hover:bg-ui-tag-red-bg-hover" : undefined}
                >
                  <Table.Cell>{dateTime(p.created, lang)}</Table.Cell>
                  <Table.Cell>{p.method_label}</Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col gap-y-0.5 py-1">
                      <StripeStatus status={p.status} />
                      {p.decline?.code && (
                        <Text size="xsmall" className="text-ui-fg-error" title={p.decline.message ?? undefined}>
                          {t(`stripe.decline.${p.decline.code}`, { defaultValue: p.decline.code.replace(/_/g, " ") })}
                        </Text>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Risk level={p.risk_level} score={p.risk_score} />
                  </Table.Cell>
                  <Table.Cell className="text-right">{money(p.amount, p.currency, lang)}</Table.Cell>
                  <Table.Cell className="text-right">{money(p.fee, p.currency, lang)}</Table.Cell>
                  <Table.Cell className="text-right">{money(p.net, p.currency, lang)}</Table.Cell>
                  <Table.Cell>
                    {p.orphan ? (
                      <Badge size="2xsmall" color="red">
                        {t("stripe.payments.noOrder")}
                      </Badge>
                    ) : (
                      <OrderLink order={p.order} demo={demo} />
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <ExternalLink href={p.dashboard_url}>Stripe</ExternalLink>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      <Note>{t("stripe.payments.orphanHint", { minutes: graceMinutes })}</Note>
    </Container>
  )
}

export const Filter = ({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) => (
  <Select size="small" value={value} onValueChange={onChange}>
    <Select.Trigger className="w-48">
      <Select.Value />
    </Select.Trigger>
    <Select.Content>
      {options.map(([v, label]) => (
        <Select.Item key={v} value={v}>
          {label}
        </Select.Item>
      ))}
    </Select.Content>
  </Select>
)
