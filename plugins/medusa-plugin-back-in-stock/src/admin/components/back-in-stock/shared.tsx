import { Badge, StatusBadge, Text, Tooltip } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

export { Pager } from "../../lib/back-in-stock/kit/page"
import type { NotificationStatus, ProductLabel, SubscriptionStatus } from "../../lib/back-in-stock/api"

type Color = "green" | "red" | "orange" | "grey" | "blue"

const SUBSCRIPTION_COLORS: Record<SubscriptionStatus, Color> = {
  active: "blue",
  pending: "orange",
  purchased: "green",
  unsubscribed: "grey",
  expired: "grey",
}

const NOTIFICATION_COLORS: Record<NotificationStatus, Color> = {
  sent: "green",
  demo: "blue",
  pending: "orange",
  skipped: "grey",
  failed: "red",
}

export const SubscriptionBadge = ({ status }: { status: SubscriptionStatus }) => {
  const { t } = useTranslation()
  return <StatusBadge color={SUBSCRIPTION_COLORS[status]}>{t(`back-in-stock.status.${status}`)}</StatusBadge>
}

export const NotificationBadge = ({ status }: { status: NotificationStatus }) => {
  const { t } = useTranslation()
  return (
    <StatusBadge color={NOTIFICATION_COLORS[status]}>{t(`back-in-stock.notificationStatus.${status}`)}</StatusBadge>
  )
}

export const DemoBadge = () => {
  const { t } = useTranslation()
  return (
    <Badge size="2xsmall" color="blue">
      {t("back-in-stock.demo")}
    </Badge>
  )
}

/** Thumbnail, product and variant, and SKU. */
export const VariantCell = ({ product }: { product: ProductLabel }) => (
  <div className="flex items-center gap-x-3">
    {product.thumbnail ? (
      <img src={product.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
    ) : (
      <div className="bg-ui-bg-component h-8 w-8 shrink-0 rounded" />
    )}
    <div className="min-w-0">
      <Text size="small" weight="plus" className="truncate">
        {product.product_title}
      </Text>
      <Text size="xsmall" className="text-ui-fg-subtle truncate">
        {[product.variant_title, product.sku].filter(Boolean).join(" · ")}
      </Text>
    </div>
  </div>
)

export const ProblemBadge = ({ problem }: { problem: string }) => {
  const { t } = useTranslation()
  return (
    <Tooltip content={t(`back-in-stock.problem.${problem}`)}>
      <Badge size="2xsmall" color="red">
        {t(`back-in-stock.reason.${problem}`)}
      </Badge>
    </Tooltip>
  )
}
