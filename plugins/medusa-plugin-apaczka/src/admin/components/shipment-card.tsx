import { ArrowDownTray, ArrowPath, ArrowUpRightOnBox, EllipsisHorizontal, TruckFast } from "@medusajs/icons"
import { Badge, Button, Copy, DropdownMenu, IconButton, StatusBadge, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { fetchDispatchCode, type Shipment, useSyncShipment } from "../lib/api"
import { errorMessage, formatDateTime, formatGrosze, STATUS_COLORS } from "../lib/format"
import { backendUrl } from "../lib/sdk"
import { CreateShipmentModal } from "./create-shipment-modal"
import { PickupDrawer } from "./pickup-drawer"
import { TrackingTimeline } from "./tracking-timeline"

const FINISHED = new Set(["delivered", "returned", "canceled"])

type Props = {
  shipment: Shipment
  orderId: string
}

export const ShipmentCard = ({ shipment, orderId }: Props) => {
  const { t, i18n } = useTranslation()
  const sync = useSyncShipment(orderId)
  const [showHistory, setShowHistory] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [pickupOpen, setPickupOpen] = useState(false)

  const isPending = shipment.status === "pending" || !shipment.apaczka_order_id
  const labelUrl = shipment.apaczka_order_id
    ? backendUrl(`/admin/apaczka/orders/${shipment.apaczka_order_id}/documents/waybill`)
    : null

  const refresh = () =>
    sync.mutate(shipment.id, {
      onSuccess: () => toast.success(t("apaczka.toast.refreshed")),
      onError: (error) => toast.error(errorMessage(error)),
    })

  const showDispatchCode = async () => {
    try {
      const { dispatch_code } = await fetchDispatchCode(shipment.apaczka_order_id!)
      if (dispatch_code) {
        toast.info(t("apaczka.toast.dispatchCode", { code: dispatch_code }))
      } else {
        toast.info(t("apaczka.toast.noDispatchCode"))
      }
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-y-3 px-6 py-4">
      <div className="flex items-start justify-between gap-x-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus" leading="compact" className="truncate">
              {[shipment.supplier, shipment.service_name].filter(Boolean).join(" · ") || `#${shipment.service_id}`}
            </Text>
            <StatusBadge color={STATUS_COLORS[shipment.status]}>{t(`apaczka.status.${shipment.status}`)}</StatusBadge>
            {shipment.is_return && <Badge size="2xsmall">{t("apaczka.return")}</Badge>}
            {shipment.is_cod && <Badge size="2xsmall">{t("apaczka.cod")}</Badge>}
          </div>
          {shipment.waybill_number && (
            <div className="text-ui-fg-subtle flex items-center gap-x-1">
              <Text size="small" className="font-mono">
                {shipment.waybill_number}
              </Text>
              <Copy content={shipment.waybill_number} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-x-2">
          {isPending ? (
            <Button size="small" onClick={() => setCreateOpen(true)}>
              {t("apaczka.actions.createShipment")}
            </Button>
          ) : (
            labelUrl && (
              <Button size="small" variant="secondary" asChild>
                <a href={labelUrl} target="_blank" rel="noreferrer">
                  <ArrowDownTray />
                  {t("apaczka.actions.label")}
                </a>
              </Button>
            )
          )}
          {!isPending && (
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton size="small" variant="transparent">
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                {shipment.tracking_url && (
                  <DropdownMenu.Item asChild>
                    <a
                      href={shipment.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-x-2"
                    >
                      <ArrowUpRightOnBox className="text-ui-fg-subtle" />
                      {t("apaczka.actions.track")}
                    </a>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item className="flex items-center gap-x-2" onClick={refresh} disabled={sync.isPending}>
                  <ArrowPath className="text-ui-fg-subtle" />
                  {t("apaczka.actions.refresh")}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="flex items-center gap-x-2" onClick={showDispatchCode}>
                  <ArrowDownTray className="text-ui-fg-subtle" />
                  {t("apaczka.actions.dispatchCode")}
                </DropdownMenu.Item>
                {!FINISHED.has(shipment.status) && (
                  <DropdownMenu.Item className="flex items-center gap-x-2" onClick={() => setPickupOpen(true)}>
                    <TruckFast className="text-ui-fg-subtle" />
                    {t("apaczka.actions.bookPickup")}
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu>
          )}
        </div>
      </div>

      {isPending && shipment.error && (
        <Text size="small" className="text-ui-fg-error">
          {t("apaczka.pendingReason", { reason: shipment.error })}
        </Text>
      )}

      {!isPending && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Field label={t("apaczka.fields.price")} value={formatGrosze(shipment.price_gross, i18n.language)} />
          <Field
            label={t("apaczka.fields.pickup")}
            value={
              shipment.pickup_type
                ? [t(`apaczka.pickupType.${shipment.pickup_type}`), shipment.pickup_date].filter(Boolean).join(" · ")
                : "—"
            }
          />
          {shipment.point_id && <Field label={t("apaczka.fields.point")} value={shipment.point_id} />}
          {shipment.is_cod && (
            <Field label={t("apaczka.fields.codAmount")} value={formatGrosze(shipment.cod_amount, i18n.language)} />
          )}
          <Field label={t("apaczka.fields.lastSync")} value={formatDateTime(shipment.last_synced_at, i18n.language)} />
        </dl>
      )}

      {!isPending && (
        <div>
          <Button size="small" variant="transparent" className="-ml-2" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? t("apaczka.actions.hideHistory") : t("apaczka.actions.showHistory")}
          </Button>
          {showHistory && (
            <div className="pt-2">
              <TrackingTimeline events={shipment.events} />
            </div>
          )}
        </div>
      )}

      <CreateShipmentModal
        fulfillmentId={shipment.fulfillment_id}
        orderId={orderId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      {!isPending && (
        <PickupDrawer shipment={shipment} orderId={orderId} open={pickupOpen} onOpenChange={setPickupOpen} />
      )}
    </div>
  )
}

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <Text size="xsmall" className="text-ui-fg-muted">
      {label}
    </Text>
    <Text size="small">{value}</Text>
  </div>
)
