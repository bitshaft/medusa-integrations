import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { ReceiptPercent } from "@medusajs/icons"
import { Badge, Skeleton, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useOrderCoupons, useSettings } from "../lib/coupons/api"
import { money } from "../lib/coupons/draft"
import { claimZone, ORDER_ZONE, OrderIntegrations, type OrderLike, registerOrderTab } from "../lib/coupons/kit/integrations"

registerOrderTab({
  id: "coupons",
  brand: { label: "coupons.title", icon: ReceiptPercent, color: "#db2777" },
  order: 45,
  useState: (order) => {
    const settings = useSettings()
    const enabled = settings.data?.enabled === true
    // Same query as the panel, so it is read once.
    const codes = useOrderCoupons(order.id, enabled)
    if (!enabled) return { visible: false, level: "none", loading: settings.isLoading }
    // Shown only for orders that used a code.
    return { visible: Boolean(codes.data?.codes.length), level: "info", loading: codes.isLoading }
  },
  Panel: ({ order }) => <OrderCoupons orderId={order.id} />,
})
claimZone(ORDER_ZONE, "coupons")

/** The codes the order used: the discount of each and the coupon (or batch) it comes from. */
const OrderCoupons = ({ orderId }: { orderId: string }) => {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useOrderCoupons(orderId, true)
  if (isLoading || !data) {
    return (
      <div className="px-6 py-4">
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  return (
    <div className="divide-y">
      {data.codes.map((code) => (
        <div key={code.code} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 flex-col gap-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" weight="plus" className="font-mono">
                {code.code}
              </Text>
              {code.automatic && (
                <Badge size="2xsmall" color="blue">
                  {t("coupons.order.automatic")}
                </Badge>
              )}
              {code.coupon?.batch && (
                <Badge size="2xsmall" color="purple">
                  {t("coupons.order.fromBatch")}
                </Badge>
              )}
            </div>
            <Text size="xsmall" className="text-ui-fg-subtle truncate">
              {code.coupon
                ? [
                    code.coupon.name ?? (code.coupon.batch ? code.coupon.code : null),
                    t(`coupons.kinds.${code.coupon.kind}.title`, { defaultValue: code.coupon.kind }),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : t("coupons.order.external")}
            </Text>
          </div>
          <Text size="small" weight="plus" className="whitespace-nowrap">
            {t("coupons.order.discount", { amount: money(code.discount, data.currency_code, i18n.language) })}
          </Text>
        </div>
      ))}
      <div className="px-6 py-3">
        <Link to="/coupons" className="text-ui-fg-interactive txt-compact-small hover:underline">
          {t("coupons.order.open")}
        </Link>
      </div>
    </div>
  )
}

/** The Integrations card at the top of the order page (rendered by one plugin for all of them). */
const CouponsOrder = ({ data: order }: DetailWidgetProps<AdminOrder>) => (
  <OrderIntegrations owner="coupons" order={order as unknown as OrderLike} />
)

export const config = defineWidgetConfig({
  zone: "order.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-order-details",
})

export default CouponsOrder
