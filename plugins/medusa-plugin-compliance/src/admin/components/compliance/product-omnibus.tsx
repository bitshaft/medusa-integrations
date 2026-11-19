import { Heading, Select, Skeleton, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { OmnibusFlags } from "./omnibus"
import { PriceChart } from "./price-chart"
import { DemoBar, Empty } from "./shared"
import { useProductPrices, useSettings } from "../../lib/compliance/api"
import { dateTime, money, shortDate } from "../../lib/compliance/format"

/** Omnibus price history on the product page: chart and table per variant and region. */
export const OmnibusSection = ({ productId }: { productId: string }) => {
  const product = { id: productId }
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const on = Boolean(settings.data?.enabled && settings.data.settings.modules.omnibus)
  const prices = useProductPrices(product.id, on)
  const [key, setKey] = useState<string | null>(null)
  if (!on) return null
  const lang = i18n.language
  const series = prices.data?.series ?? []
  const keyOf = (s: (typeof series)[number]) => `${s.variant_id}|${s.region_id}|${s.currency_code}`
  const current = series.find((s) => keyOf(s) === key) ?? series[0]

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h2">{t("compliance.omnibus.widgetTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {prices.data?.started_at
            ? t("compliance.omnibus.recordingSince", {
                date: shortDate(prices.data.started_at, lang),
                days: prices.data.period_days,
              })
            : t("compliance.omnibus.notStarted")}
        </Text>
      </div>
      {prices.data?.demo && <DemoBar />}
      {prices.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !current ? (
        <Empty>{t("compliance.omnibus.noHistory")}</Empty>
      ) : (
        <>
          {series.length > 1 && (
            <Select size="small" value={keyOf(current)} onValueChange={setKey}>
              <Select.Trigger className="w-full md:w-96">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {series.map((s) => (
                  <Select.Item key={keyOf(s)} value={keyOf(s)}>
                    {[
                      s.variant_title ?? s.sku ?? s.variant_id,
                      s.region_name ?? s.region_id,
                      s.currency_code.toUpperCase(),
                    ].join(" · ")}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Fact label={t("compliance.omnibus.price")} value={money(current.amount, current.currency_code, lang)} />
            <Fact label={t("compliance.omnibus.regular")} value={money(current.regular, current.currency_code, lang)} />
            <Fact
              label={t("compliance.omnibus.lowest")}
              value={current.discounted ? money(current.lowest, current.currency_code, lang) : "—"}
            />
            <Fact
              label={t("compliance.omnibus.since")}
              value={
                current.discounted ? shortDate(current.discount_started_at, lang) : t("compliance.omnibus.noDiscount")
              }
            />
          </div>
          <OmnibusFlags row={current} />
          <PriceChart
            points={current.points}
            currency={current.currency_code}
            periodStart={current.period_start}
            discountStart={current.discount_started_at}
            lowest={current.discounted ? current.lowest : null}
          />
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("compliance.omnibus.from")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("compliance.omnibus.price")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("compliance.omnibus.regular")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.omnibus.kind")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {[...current.points].reverse().map((p) => (
                <Table.Row key={p.at}>
                  <Table.Cell>{dateTime(p.at, lang)}</Table.Cell>
                  <Table.Cell className="text-right">{money(p.amount, current.currency_code, lang)}</Table.Cell>
                  <Table.Cell className="text-right">{money(p.regular, current.currency_code, lang)}</Table.Cell>
                  <Table.Cell>
                    {p.source === "snapshot"
                      ? t("compliance.omnibus.kinds.snapshot")
                      : p.discounted
                        ? t(`compliance.omnibus.kinds.${p.kind ?? "price_list"}`)
                        : t("compliance.omnibus.kinds.regular")}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </>
      )}
    </div>
  )
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" weight="plus">
      {value}
    </Text>
  </div>
)
