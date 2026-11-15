import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Container, Heading, Skeleton, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { DemoBar, ExternalLink, Incomplete, Risk, StripeStatus } from "../components/stripe/shared"
import { type OrderPayment, useOrderPayments, useStatus } from "../lib/stripe/api"
import { date, money } from "../lib/stripe/format"

/** The Stripe side of an order's payment: method, fee, net, 3D Secure, Radar, refunds, disputes, payout. */
const StripeOrderWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { t } = useTranslation()
  const status = useStatus()
  // Medusa reloads the order after a capture or refund; its payment state is
  // part of the query key, so the widget then reads Stripe again too.
  const version = `${order.payment_status}|${(order.payment_collections ?? []).map((c) => `${c.captured_amount}:${c.refunded_amount}`).join(",")}`
  const payments = useOrderPayments(order.id, version)
  if (!status.data?.enabled) return null
  const list = payments.data?.payments ?? []
  if (!payments.isLoading && !list.length && !payments.isError) return null

  return (
    <Container className="flex flex-col gap-y-3 p-6">
      <Heading level="h2">{t("stripe.widget.title")}</Heading>
      {payments.data?.demo && <DemoBar />}
      <Incomplete data={payments.data} />
      {payments.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        list.map((p) => <PaymentCard key={p.id} payment={p} />)
      )}
    </Container>
  )
}

const PaymentCard = ({ payment: p }: { payment: OrderPayment }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const s = p.settlement
  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StripeStatus status={p.status} />
        <Text size="small" weight="plus">
          {p.method_label}
        </Text>
        <ExternalLink href={p.dashboard_url}>{t("stripe.widget.openStripe")}</ExternalLink>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Field label={t("stripe.amount")} value={money(p.amount, p.currency, lang)} />
        <Field label={t("stripe.fee")} value={s ? money(s.fee, s.currency, lang) : "—"} />
        <Field label={t("stripe.net")} value={s ? money(s.net, s.currency, lang) : "—"} />
        {p.exchange_rate && s && (
          <Field
            label={t("stripe.widget.exchange")}
            value={`${money(s.amount, s.currency, lang)} · ${p.exchange_rate}`}
          />
        )}
        <Field
          label={t("stripe.widget.threeDs")}
          value={
            p.three_d_secure
              ? `${t(`stripe.threeDs.${p.three_d_secure}`, { defaultValue: p.three_d_secure })}${p.three_d_secure_version ? ` (${p.three_d_secure_version})` : ""}`
              : "—"
          }
        />
        <Field label={t("stripe.payments.radar")} value={<Risk level={p.risk_level} score={p.risk_score} />} />
        <Field
          label={t("stripe.widget.payout")}
          value={
            p.payout ? (
              <ExternalLink href={p.payout.dashboard_url}>
                {`${money(p.payout.amount, p.payout.currency, lang)} · ${date(p.payout.arrival_date, lang)}`}
              </ExternalLink>
            ) : s ? (
              t("stripe.widget.availableOn", { date: date(s.available_on, lang) })
            ) : (
              "—"
            )
          }
        />
        <Field
          label={t("stripe.widget.capture")}
          value={t(`stripe.widget.captureMode.${p.capture_method?.startsWith("automatic") ? "automatic" : "manual"}`)}
        />
      </dl>
      {p.decline?.code && (
        <Text size="small" className="text-ui-fg-error">
          {t(`stripe.decline.${p.decline.code}`, { defaultValue: p.decline.message ?? p.decline.code })}
        </Text>
      )}
      {p.refunds.length > 0 && (
        <div className="flex flex-col gap-y-1">
          <Text size="small" weight="plus">
            {t("stripe.widget.refunds")}
          </Text>
          {p.refunds.map((r) => (
            <Text key={r.id} size="small">
              {money(r.amount, r.currency, lang)} · {date(r.created, lang)} ·{" "}
              {t(`stripe.status.${r.status}`, { defaultValue: r.status })}
            </Text>
          ))}
        </div>
      )}
      {p.disputes.length > 0 && (
        <div className="flex flex-col gap-y-1">
          <Text size="small" weight="plus" className="text-ui-fg-error">
            {t("stripe.widget.disputes")}
          </Text>
          {p.disputes.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              <Text size="small">{money(d.amount, d.currency, lang)}</Text>
              <Badge size="2xsmall" color={d.urgent ? "red" : "orange"}>
                {t(`stripe.disputes.reasons.${d.reason}`, { defaultValue: d.reason })}
              </Badge>
              <ExternalLink href={d.dashboard_url}>{t("stripe.disputes.respond")}</ExternalLink>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const Field = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex flex-col">
    <Text size="xsmall" className="text-ui-fg-muted">
      {label}
    </Text>
    <Text size="small" as="div">
      {value}
    </Text>
  </div>
)

export const config = defineWidgetConfig({ zone: "order.details.side.after" })

export default StripeOrderWidget
