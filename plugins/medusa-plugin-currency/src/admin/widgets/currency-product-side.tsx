import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ScopeCard } from "../components/currency/scope-card"
import { useProductPrices } from "../lib/currency/api"
import { installPriceEditorHelper } from "../lib/currency/price-editor"

// "Suggest prices" in Medusa's own price grids (see price-editor.tsx); started once, with the admin.
installPriceEditorHelper()

/** "Prices in currencies" beside the product's variants: what is missing, and "Fill from PLN" for all variants. */
const CurrencyProductSide = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const { t } = useTranslation()
  const prices = useProductPrices(data.id)
  const missing = prices.data?.missing ?? {}
  const variants = prices.data?.variants.length ?? 0
  const noBase = prices.data?.variants.filter((variant) => !variant.has_base).length ?? 0
  return (
    <ScopeCard scope={{ kind: "products", ids: [data.id] }} title={t("currency.widget.title")} name={data.title}>
      {prices.data && (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          {Object.entries(missing).map(([code, count]) => (
            <div key={code} className="flex items-center justify-between gap-x-2">
              <Text size="small">{code.toUpperCase()}</Text>
              {count ? (
                <Badge size="2xsmall" color="orange">
                  {t("currency.widget.missingCount", { count, total: variants })}
                </Badge>
              ) : (
                <Badge size="2xsmall" color="green">
                  {t("currency.widget.complete")}
                </Badge>
              )}
            </div>
          ))}
          {noBase > 0 && (
            <Text size="xsmall" className="text-ui-fg-error">
              {t("currency.widget.noBase", { count: noBase, base: (prices.data.base ?? "").toUpperCase() })}
            </Text>
          )}
        </div>
      )}
    </ScopeCard>
  )
}

export const config = defineWidgetConfig({ zone: "product.details.side.after" })

export default CurrencyProductSide
