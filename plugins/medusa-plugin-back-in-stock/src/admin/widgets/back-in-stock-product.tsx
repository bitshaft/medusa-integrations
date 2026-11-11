import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ProblemBadge } from "../components/back-in-stock/shared"
import { useBackInStockStatus, useProductWaiting } from "../lib/back-in-stock/api"
import { formatDateTime } from "../lib/back-in-stock/kit/format"

/** Product page panel: people waiting for each variant, and variants that can never come back. */
const BackInStockProduct = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const { t, i18n } = useTranslation()
  const status = useBackInStockStatus()
  const enabled = status.data?.enabled === true
  const { data, isLoading } = useProductWaiting(product.id, enabled)

  if (!enabled) {
    return null
  }
  const variants = (data?.variants ?? []).filter((variant) => variant.waiting || variant.pending || variant.problem)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("back-in-stock.widget.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("back-in-stock.widget.subtitle")}
        </Text>
      </div>
      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {!isLoading && !variants.length && (
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          {t("back-in-stock.widget.empty")}
        </Text>
      )}
      {variants.map((variant) => (
        <div key={variant.id} className="flex flex-col gap-y-1 px-6 py-3">
          <div className="flex items-center justify-between gap-x-2">
            <Text size="small" weight="plus" className="truncate">
              {variant.title ?? variant.sku ?? variant.id}
            </Text>
            <Text size="small" weight="plus">
              {t("back-in-stock.widget.waiting", { count: variant.waiting })}
            </Text>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {[
              variant.pending ? t("back-in-stock.widget.pending", { count: variant.pending }) : null,
              variant.last_notified_at
                ? t("back-in-stock.widget.lastNotified", {
                    date: formatDateTime(variant.last_notified_at, i18n.language),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {variant.problem && (
            <div>
              <ProblemBadge problem={variant.problem} />
            </div>
          )}
        </div>
      ))}
      <div className="px-6 py-3">
        <Link to="/back-in-stock" className="text-ui-fg-interactive txt-compact-small hover:underline">
          {t("back-in-stock.widget.open")}
        </Link>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default BackInStockProduct
