import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ShipmentCard } from "../components/shipment-card"
import { type Shipment, useOrderShipments } from "../lib/api"

/**
 * Order page panel: one card per Apaczka fulfillment, with label download,
 * tracking history, courier booking and — for shipments not created yet —
 * a form to create them.
 */
const OrderApaczkaShipments = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useOrderShipments(order.id)

  // Apaczka fulfillments that have no shipment record yet (e.g. created
  // before the plugin was installed) still get a "Create shipment" card.
  const shipments = useMemo<Shipment[]>(() => {
    const known = data?.shipments ?? []
    const knownIds = new Set(known.map((s) => s.fulfillment_id))
    const orphans = (order.fulfillments ?? [])
      .filter((f) => f.provider_id?.startsWith("apaczka_") && !f.canceled_at && !knownIds.has(f.id))
      .map((f) => placeholder(f.id, order.id))
    return [...known, ...orphans]
  }, [data, order])

  const hasApaczka =
    shipments.length > 0 || (order.shipping_methods ?? []).some((m) => m.shipping_option_id && isApaczkaMethod(m))

  if (!isLoading && !hasApaczka) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">{t("apaczka.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("apaczka.subtitle")}
          </Text>
        </div>
      </div>

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
        <ShipmentCard key={shipment.id} shipment={shipment} orderId={order.id} />
      ))}
    </Container>
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
  zone: "order.details.after",
})

export default OrderApaczkaShipments
