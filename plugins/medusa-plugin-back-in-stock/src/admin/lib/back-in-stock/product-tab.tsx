import { BellAlert } from "@medusajs/icons"
import { Skeleton, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ProblemBadge } from "../../components/back-in-stock/shared"
import { useBackInStockStatus, useProductWaiting } from "./api"
import { formatDateTime } from "./kit/format"
import { registerTab } from "./kit/integrations"
import { Empty } from "./kit/page"

/** The Back in stock tab of the product page's Integrations card: who waits for which variant. */
registerTab("product", {
  id: "back-in-stock",
  brand: { label: "back-in-stock.title", icon: BellAlert, color: "#7c3aed" },
  order: 40,
  useState: (product) => {
    const status = useBackInStockStatus()
    const enabled = status.data?.enabled === true
    const { data, isLoading } = useProductWaiting(product.id, enabled)
    const variants = (data?.variants ?? []).filter((v) => v.waiting || v.pending || v.problem)
    if (!enabled || !variants.length) return { visible: false, level: "none", loading: status.isLoading || isLoading }
    return { visible: true, level: variants.some((v) => v.problem) ? "warn" : "info" }
  },
  Panel: ({ entity }) => <BackInStockProduct productId={entity.id} />,
})

/** People waiting for each variant, and variants that can never come back. */
const BackInStockProduct = ({ productId }: { productId: string }) => {
  const product = { id: productId }
  const { t, i18n } = useTranslation()
  const status = useBackInStockStatus()
  const enabled = status.data?.enabled === true
  const { data, isLoading } = useProductWaiting(product.id, enabled)

  if (!enabled) {
    return null
  }
  const variants = (data?.variants ?? []).filter((variant) => variant.waiting || variant.pending || variant.problem)

  return (
    <div className="divide-y">
      <Text size="small" className="text-ui-fg-subtle px-6 py-4">
        {t("back-in-stock.widget.subtitle")}
      </Text>
      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {!isLoading && !variants.length && (
        <div className="px-6 py-4">
          <Empty>{t("back-in-stock.widget.empty")}</Empty>
        </div>
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
    </div>
  )
}
