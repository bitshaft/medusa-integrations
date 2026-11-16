import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ProductSafetyForm } from "../components/compliance/product-safety-form"
import { DemoBar } from "../components/compliance/shared"
import { useProductSafety, useSettings } from "../lib/compliance/api"

/** GPSR data on the product page: manufacturer, responsible person, identification, warnings. */
const ProductGpsrWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const { t } = useTranslation()
  const settings = useSettings()
  const on = settings.data?.enabled && settings.data.settings.modules.gpsr
  const safety = useProductSafety(product.id)
  if (!on) return null
  const demo = Boolean(settings.data?.settings.demo)
  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h2">{t("compliance.gpsr.widgetTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("compliance.gpsr.widgetHint")}
        </Text>
      </div>
      {demo && <DemoBar />}
      {safety.isLoading || !safety.data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <ProductSafetyForm productId={product.id} current={safety.data} demo={demo} />
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "product.details.after" })

export default ProductGpsrWidget
