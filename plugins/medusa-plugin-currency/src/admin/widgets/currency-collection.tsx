import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCollection, DetailWidgetProps } from "@medusajs/framework/types"
import { useTranslation } from "react-i18next"

import { ScopeCard } from "../components/currency/scope-card"

/** "Fill prices for the whole collection" on Medusa's collection page. */
const CurrencyCollection = ({ data }: DetailWidgetProps<AdminCollection>) => {
  const { t } = useTranslation()
  return (
    <ScopeCard
      scope={{ kind: "collection", id: data.id }}
      title={t("currency.widget.collectionTitle")}
      name={data.title}
    />
  )
}

export const config = defineWidgetConfig({ zone: "product_collection.details.after" })

export default CurrencyCollection
