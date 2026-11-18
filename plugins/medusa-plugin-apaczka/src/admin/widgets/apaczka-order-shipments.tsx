import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Skeleton, Text } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ShipmentCard } from "../components/apaczka/shipment-card"
import { type Shipment, useOrderShipments } from "../lib/apaczka/api"
import apaczkaLogo from "../lib/apaczka/apaczka-logo.png"
import {
  claimZone,
  type Level,
  ORDER_ZONE,
  OrderIntegrations,
  type OrderLike,
  registerOrderTab,
} from "../lib/apaczka/kit/integrations"

type OrderFulfillment = { id: string; provider_id?: string | null; canceled_at?: string | null }

/**
 * The order's Apaczka shipments. Fulfillments that have no shipment record
 * yet (e.g. created before the plugin was installed) still get a "Create
 * shipment" card.
 */
const useOrderApaczka = (order: OrderLike) => {
  const query = useOrderShipments(order.id)
  const shipments = useMemo<Shipment[]>(() => {
    const known = query.data?.shipments ?? []
    const knownIds = new Set(known.map((s) => s.fulfillment_id))
    const orphans = ((order.fulfillments ?? []) as OrderFulfillment[])
      .filter((f) => f.provider_id?.startsWith("apaczka_") && !f.canceled_at && !knownIds.has(f.id))
      .map((f) => placeholder(f.id, order.id))
    return [...known, ...orphans]
  }, [query.data, order])
  const hasApaczka =
    shipments.length > 0 ||
    (
      (order.shipping_methods ?? []) as Array<{
        shipping_option_id?: string | null
        data?: Record<string, unknown> | null
      }>
    ).some((m) => m.shipping_option_id && isApaczkaMethod(m))
  return { ...query, shipments, hasApaczka }
}

/** Problems red, shipments still to create or returned orange, on the way blue, delivered green. */
function levelOf(shipments: Shipment[]): Level {
  const live = shipments.filter((s) => s.status !== "canceled")
  if (
    live.some((s) => s.status === "exception" || (s.status === "pending" && s.error && s.error !== "missing_weight"))
  ) {
    return "error"
  }
  if (live.some((s) => s.status === "pending" || s.status === "returned")) return "warn"
  if (live.length && live.every((s) => s.status === "delivered")) return "ok"
  return live.length ? "info" : "none"
}

registerOrderTab({
  id: "apaczka",
  brand: { label: "Apaczka", logo: apaczkaLogo },
  order: 20,
  useState: (order) => {
    const { shipments, hasApaczka, isLoading } = useOrderApaczka(order)
    return { visible: hasApaczka, level: levelOf(shipments), loading: isLoading }
  },
  Panel: ({ order }) => <ApaczkaPanel order={order} />,
})
claimZone(ORDER_ZONE, "apaczka")

/** The Integrations card at the top of the order page (rendered by one plugin for all of them). */
const OrderApaczkaShipments = ({ data: order }: DetailWidgetProps<AdminOrder>) => (
  <OrderIntegrations owner="apaczka" order={order as unknown as OrderLike} />
)

/**
 * One card per Apaczka fulfillment, with label download, tracking history,
 * courier booking and, for shipments not created yet, a form to create them.
 */
const ApaczkaPanel = ({ order }: { order: OrderLike }) => {
  const { t } = useTranslation()
  const { shipments, isLoading, isError } = useOrderApaczka(order)

  return (
    <div className="divide-y">
      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {t("apaczka.loadError")}
        </Text>
      )}

      {!isLoading && !shipments.length && (
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          {t("apaczka.empty")}
        </Text>
      )}

      {shipments.map((shipment) => (
        <ShipmentCard key={shipment.id} shipment={shipment} />
      ))}
    </div>
  )
}

function isApaczkaMethod(method: { data?: Record<string, unknown> | null }): boolean {
  const option = method.data?.apaczka_option as { id?: string } | undefined
  return Boolean(option?.id?.startsWith("apaczka-"))
}

function placeholder(fulfillmentId: string, orderId: string): Shipment {
  return {
    id: `pending-${fulfillmentId}`,
    fulfillment_id: fulfillmentId,
    order_id: orderId,
    apaczka_order_id: null,
    waybill_number: null,
    tracking_url: null,
    service_id: 0,
    service_name: null,
    supplier: null,
    status: "pending",
    raw_status: null,
    is_return: false,
    is_cod: false,
    point_id: null,
    label_format: "pdf",
    price_net: null,
    price_gross: null,
    cod_amount: null,
    declared_value: null,
    pickup_type: null,
    pickup_date: null,
    pickup_number: null,
    last_synced_at: null,
    error: null,
    metadata: null,
    created_at: new Date().toISOString(),
    events: [],
  }
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderApaczkaShipments
