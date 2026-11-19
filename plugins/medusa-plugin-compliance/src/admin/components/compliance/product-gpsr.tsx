import { Heading, Skeleton, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ProductSafetyForm } from "./product-safety-form"
import { DemoBar } from "./shared"
import { useProductSafety, useSettings } from "../../lib/compliance/api"

/** GPSR data on the product page: manufacturer, responsible person, identification, warnings. */
export const GpsrSection = ({ productId }: { productId: string }) => {
  const product = { id: productId }
  const { t } = useTranslation()
  const settings = useSettings()
  const on = settings.data?.enabled && settings.data.settings.modules.gpsr
  const safety = useProductSafety(product.id)
  if (!on) return null
  const demo = Boolean(settings.data?.settings.demo)
  return (
    <div className="flex flex-col gap-y-4 p-6">
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
    </div>
  )
}
