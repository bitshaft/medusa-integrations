import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProductCategory, DetailWidgetProps } from "@medusajs/framework/types"
import { useTranslation } from "react-i18next"

import { ScopeCard } from "../components/currency/scope-card"

/** "Fill prices for the whole category" (with its subcategories) on Medusa's category page. */
const CurrencyCategory = ({ data }: DetailWidgetProps<AdminProductCategory>) => {
  const { t } = useTranslation()
  return (
    <ScopeCard scope={{ kind: "category", id: data.id }} title={t("currency.widget.categoryTitle")} name={data.name} />
  )
}

export const config = defineWidgetConfig({ zone: "product_category.details.after" })

export default CurrencyCategory
