import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProductVariant, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useProductPrices } from "../lib/currency/api"
import { formatMoney, formatRate } from "../lib/currency/format"
import { formatDate } from "../lib/currency/kit/format"

/** Beside a variant's prices: where each price came from (manual, or filled on a day at a rate). */
const CurrencyVariantSide = ({ data }: DetailWidgetProps<AdminProductVariant>) => {
  const { t, i18n } = useTranslation()
  const prices = useProductPrices(data.product_id)
  const variant = prices.data?.variants.find((v) => v.id === data.id)
  const base = prices.data?.base ?? ""
  const rows = (variant?.prices ?? []).filter((price) => price.origin)
  if (!variant || !rows.length) return null
  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("currency.widget.originTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("currency.widget.originSubtitle", { base: base.toUpperCase() })}
        </Text>
      </div>
      {rows.map((price) => (
        <div key={price.id} className="flex flex-col gap-y-0.5 px-6 py-3">
          <div className="flex items-center justify-between gap-x-2">
            <Text size="small" weight="plus">
              {formatMoney(price.amount, price.currency, i18n.language)}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle truncate">
              {[price.price_list_title, price.region_name].filter(Boolean).join(" · ")}
            </Text>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {price.origin?.kind === "filled"
              ? `${t("currency.origin.filled", {
                  date: formatDate(price.origin.at, i18n.language),
                  rate: formatRate(price.origin.rate, price.currency, base, i18n.language),
                })}${price.origin.table ? ` · ${t("currency.rate.source", { table: price.origin.table, date: formatDate(price.origin.rate_date, i18n.language) })}` : ""}`
              : t("currency.origin.manual")}
          </Text>
        </div>
      ))}
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "product_variant.details.side.after" })

export default CurrencyVariantSide
