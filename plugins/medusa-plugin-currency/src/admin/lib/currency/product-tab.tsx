import { Cash } from "@medusajs/icons"
import { Badge, Skeleton, Table, Text, Tooltip } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { type ProductPrices, useCurrencyStatus, useProductPrices } from "./api"
import { formatMoney, formatRate } from "./format"
import { formatDate } from "./kit/format"
import { registerTab } from "./kit/integrations"
import { Empty } from "./kit/page"

export const brand = { label: "currency.title", icon: Cash, color: "#0891b2" }

/** The Currencies tab of the product page's Integrations card: every price and where it came from. */
registerTab("product", {
  id: "currency",
  brand,
  order: 35,
  useState: (product) => {
    const status = useCurrencyStatus()
    const prices = useProductPrices(product.id)
    const data = prices.data
    if (status.data?.enabled !== true || !data || !data.targets.length) {
      return { visible: false, level: "none", loading: status.isLoading || prices.isLoading }
    }
    const missing = Object.values(data.missing).some(Boolean)
    return { visible: true, level: missing ? "warn" : "ok" }
  },
  Panel: ({ entity }) => <ProductCurrencies productId={entity.id} />,
})

const ProductCurrencies = ({ productId }: { productId: string }) => {
  const { t } = useTranslation()
  const { data, isLoading } = useProductPrices(productId)
  if (isLoading || !data) {
    return (
      <div className="px-6 py-4">
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  return (
    <div className="divide-y">
      <Text size="small" className="text-ui-fg-subtle px-6 py-4">
        {t("currency.widget.subtitle", { base: (data.base ?? "").toUpperCase() })}
      </Text>
      {!data.variants.length ? (
        <div className="px-6 py-4">
          <Empty>{t("currency.widget.noVariants")}</Empty>
        </div>
      ) : (
        <PriceOrigins data={data} />
      )}
      <div className="px-6 py-3">
        <Link to="/currency?tab=history" className="text-ui-fg-interactive txt-compact-small hover:underline">
          {t("currency.widget.openHistory")}
        </Link>
      </div>
    </div>
  )
}

/** Variants × currencies: the amount, and "manual" or "filled on … at …". */
export const PriceOrigins = ({ data, variantId }: { data: ProductPrices; variantId?: string }) => {
  const { t, i18n } = useTranslation()
  const codes = [data.base, ...data.targets].filter(Boolean) as string[]
  const variants = data.variants.filter((variant) => !variantId || variant.id === variantId)
  return (
    <div className="overflow-x-auto">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t("currency.col.variant")}</Table.HeaderCell>
            {codes.map((code) => (
              <Table.HeaderCell key={code}>{code.toUpperCase()}</Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {variants.map((variant) => (
            <Table.Row key={variant.id}>
              <Table.Cell className="max-w-[200px]">
                <Text size="small" weight="plus" className="truncate">
                  {variant.title ?? variant.sku ?? variant.id}
                </Text>
              </Table.Cell>
              {codes.map((code) => {
                const price = variant.prices.find(
                  (p) => p.currency === code && !p.price_list_id && !p.region_id && !p.min_quantity && !p.max_quantity
                )
                const extra = variant.prices.filter((p) => p.currency === code && p !== price).length
                if (!price) {
                  return (
                    <Table.Cell key={code}>
                      <Badge size="2xsmall" color={code === data.base ? "red" : "orange"}>
                        {t("currency.widget.missing")}
                      </Badge>
                    </Table.Cell>
                  )
                }
                const origin = price.origin
                return (
                  <Table.Cell key={code}>
                    <Text size="small" className="whitespace-nowrap">
                      {formatMoney(price.amount, code, i18n.language)}
                    </Text>
                    {origin && (
                      <Tooltip
                        content={
                          origin.kind === "filled"
                            ? [
                                formatRate(origin.rate, code, data.base ?? "", i18n.language),
                                origin.table
                                  ? t("currency.rate.source", {
                                      table: origin.table,
                                      date: formatDate(origin.rate_date, i18n.language),
                                    })
                                  : t("currency.rate.fixed"),
                              ].join(" · ")
                            : t("currency.origin.manualHint")
                        }
                      >
                        <Text size="xsmall" className="text-ui-fg-subtle whitespace-nowrap">
                          {origin.kind === "filled"
                            ? t("currency.origin.filled", {
                                date: formatDate(origin.at, i18n.language),
                                rate: formatRate(origin.rate, code, data.base ?? "", i18n.language),
                              })
                            : t("currency.origin.manual")}
                        </Text>
                      </Tooltip>
                    )}
                    {extra > 0 && (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {t("currency.widget.more", { count: extra })}
                      </Text>
                    )}
                  </Table.Cell>
                )
              })}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  )
}
