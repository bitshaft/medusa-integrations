import {
  ArrowDownTray,
  ArrowPath,
  ArrowUpRightOnBox,
  DocumentText,
  EllipsisHorizontal,
  TruckFast,
} from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  DropdownMenu,
  IconButton,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  downloadTurnIn,
  type Shipment,
  type ShipmentsFilter,
  useShipments,
  useSyncShipment,
} from "../../lib/apaczka/api"
import { errorMessage, formatDateTime, formatGrosze, STATUS_COLORS } from "../../lib/apaczka/format"
import { backendUrl } from "../../lib/apaczka/kit/sdk"
import { PickupDrawer } from "./pickup-drawer"
import { ShipmentCard } from "./shipment-card"

const PAGE_SIZE = 20
const FINISHED = new Set(["delivered", "returned", "canceled"])

/** Status filter groups → the `status` query value. */
const STATUS_GROUPS = {
  all: undefined,
  active: "created,posted,in_transit,out_for_delivery,ready_for_pickup",
  pending: "pending",
  attention: "exception,claimed,unknown",
  delivered: "delivered",
  closed: "returned,canceled",
} as const
type StatusGroup = keyof typeof STATUS_GROUPS

const TYPES = { all: undefined, shipments: "false", returns: "true" } as const
type TypeFilter = keyof typeof TYPES

/**
 * Every Apaczka shipment in the store: search, filters, labels, tracking
 * refresh, and courier pickups or a hand-over protocol for several
 * shipments at once.
 */
export const ShipmentsList = () => {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [group, setGroup] = useState<StatusGroup>("all")
  const [type, setType] = useState<TypeFilter>("all")
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Map<string, Shipment>>(new Map())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pickupOpen, setPickupOpen] = useState(false)
  const [turnInLoading, setTurnInLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => setPage(0), [q, group, type])

  const filter: ShipmentsFilter = {
    q: q || undefined,
    status: STATUS_GROUPS[group],
    is_return: TYPES[type],
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }
  const list = useShipments(filter)
  const shipments = list.data?.shipments ?? []
  const count = list.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const filtered = Boolean(q) || group !== "all" || type !== "all"

  // Keep the selection and the open details in step with fresh data.
  useEffect(() => {
    if (!list.data) {
      return
    }
    setSelected((current) => {
      let changed = false
      const next = new Map(current)
      for (const shipment of list.data.shipments) {
        if (next.has(shipment.id)) {
          next.set(shipment.id, shipment)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [list.data])

  const detail = useMemo(
    () => (detailId ? (shipments.find((s) => s.id === detailId) ?? selected.get(detailId) ?? null) : null),
    [detailId, shipments, selected]
  )

  const chosen = [...selected.values()]
  const pickupable = chosen.filter((s) => s.apaczka_order_id && !FINISHED.has(s.status))
  const oneCourier =
    pickupable.length > 0 &&
    pickupable.every(
      (s) =>
        s.service_id === pickupable[0].service_id &&
        s.metadata?.sender_postal_code === pickupable[0].metadata?.sender_postal_code
    )
  const withLabel = chosen.filter((s) => s.apaczka_order_id)

  const toggle = (shipment: Shipment, on: boolean) =>
    setSelected((current) => {
      const next = new Map(current)
      if (on) next.set(shipment.id, shipment)
      else next.delete(shipment.id)
      return next
    })

  const allOnPage = shipments.length > 0 && shipments.every((s) => selected.has(s.id))
  const someOnPage = shipments.some((s) => selected.has(s.id))
  const togglePage = (on: boolean) =>
    setSelected((current) => {
      const next = new Map(current)
      for (const shipment of shipments) {
        if (on) next.set(shipment.id, shipment)
        else next.delete(shipment.id)
      }
      return next
    })

  const turnIn = async () => {
    setTurnInLoading(true)
    try {
      await downloadTurnIn(withLabel.map((s) => s.id))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setTurnInLoading(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <Input
          type="search"
          size="small"
          className="w-full max-w-[320px]"
          placeholder={t("apaczka.list.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="w-[200px]">
          <Select size="small" value={group} onValueChange={(value) => setGroup(value as StatusGroup)}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {(Object.keys(STATUS_GROUPS) as StatusGroup[]).map((key) => (
                <Select.Item key={key} value={key}>
                  {t(`apaczka.list.statusFilter.${key}`)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div className="w-[160px]">
          <Select size="small" value={type} onValueChange={(value) => setType(value as TypeFilter)}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {(Object.keys(TYPES) as TypeFilter[]).map((key) => (
                <Select.Item key={key} value={key}>
                  {t(`apaczka.list.typeFilter.${key}`)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <Button
          size="small"
          variant="transparent"
          className="ml-auto"
          isLoading={list.isFetching && !list.isLoading}
          onClick={() => list.refetch()}
        >
          <ArrowPath />
          {t("apaczka.list.reload")}
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="bg-ui-bg-subtle flex flex-wrap items-center gap-2 border-y px-6 py-3">
          <Text size="small" weight="plus">
            {t("apaczka.list.selected", { count: selected.size })}
          </Text>
          <Button size="small" variant="transparent" onClick={() => setSelected(new Map())}>
            {t("apaczka.list.clear")}
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {pickupable.length > 0 && !oneCourier && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("apaczka.list.mixedPickup")}
              </Text>
            )}
            <Button size="small" variant="secondary" disabled={!oneCourier} onClick={() => setPickupOpen(true)}>
              <TruckFast />
              {t("apaczka.list.bookPickup", { count: pickupable.length })}
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={!withLabel.length}
              isLoading={turnInLoading}
              onClick={turnIn}
            >
              <DocumentText />
              {t("apaczka.list.turnIn")}
            </Button>
          </div>
        </div>
      )}

      {list.isLoading ? (
        <div className="px-6 pb-4">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : list.isError ? (
        <Text size="small" className="text-ui-fg-error px-6 pb-4">
          {errorMessage(list.error)}
        </Text>
      ) : !shipments.length ? (
        <Text size="small" className="text-ui-fg-subtle px-6 pb-6">
          {filtered ? t("apaczka.list.emptyFiltered") : t("apaczka.list.empty")}
        </Text>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell className="w-[1%]">
                  <Checkbox
                    checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                    onCheckedChange={(value) => togglePage(value === true)}
                    aria-label={t("apaczka.list.selectPage")}
                  />
                </Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.list.columns.order")}</Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.list.columns.shipment")}</Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.list.columns.status")}</Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.fields.pickup")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("apaczka.fields.price")}</Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.list.columns.created")}</Table.HeaderCell>
                <Table.HeaderCell className="w-[1%]" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {shipments.map((shipment) => (
                <Table.Row key={shipment.id} className="cursor-pointer" onClick={() => setDetailId(shipment.id)}>
                  <Table.Cell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(shipment.id)}
                      onCheckedChange={(value) => toggle(shipment, value === true)}
                      aria-label={t("apaczka.list.selectOne")}
                    />
                  </Table.Cell>
                  <Table.Cell onClick={(e) => e.stopPropagation()}>
                    {shipment.order_id ? (
                      <Link to={`/orders/${shipment.order_id}`} className="text-ui-fg-interactive hover:underline">
                        {shipment.order_display_id ? `#${shipment.order_display_id}` : shipment.order_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col">
                      <Text size="small" className="font-mono">
                        {shipment.waybill_number ?? "—"}
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {[shipment.supplier, shipment.service_name].filter(Boolean).join(" · ") ||
                          `#${shipment.service_id}`}
                      </Text>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge color={STATUS_COLORS[shipment.status]}>
                        {t(`apaczka.status.${shipment.status}`)}
                      </StatusBadge>
                      {shipment.is_return && <Badge size="2xsmall">{t("apaczka.return")}</Badge>}
                      {shipment.is_cod && <Badge size="2xsmall">{t("apaczka.cod")}</Badge>}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">
                      {shipment.pickup_type
                        ? [t(`apaczka.pickupType.${shipment.pickup_type}`), shipment.pickup_date]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="text-right">{formatGrosze(shipment.price_gross, i18n.language)}</Table.Cell>
                  <Table.Cell>{formatDateTime(shipment.created_at, i18n.language)}</Table.Cell>
                  <Table.Cell onClick={(e) => e.stopPropagation()}>
                    <RowActions shipment={shipment} onDetails={() => setDetailId(shipment.id)} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Table.Pagination
            count={count}
            pageSize={PAGE_SIZE}
            pageIndex={page}
            pageCount={pageCount}
            canPreviousPage={page > 0}
            canNextPage={page + 1 < pageCount}
            previousPage={() => setPage((p) => Math.max(0, p - 1))}
            nextPage={() => setPage((p) => p + 1)}
            translations={{
              of: t("apaczka.list.pagination.of"),
              results: t("apaczka.list.pagination.results"),
              pages: t("apaczka.list.pagination.pages"),
              prev: t("apaczka.list.pagination.prev"),
              next: t("apaczka.list.pagination.next"),
            }}
          />
        </>
      )}

      <Drawer open={Boolean(detail)} onOpenChange={(open) => !open && setDetailId(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              {detail?.order_display_id
                ? t("apaczka.list.detailTitleOrder", { order: detail.order_display_id })
                : t("apaczka.list.detailTitle")}
            </Drawer.Title>
            <Drawer.Description className="sr-only">{t("apaczka.subtitle")}</Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto p-0">{detail && <ShipmentCard shipment={detail} />}</Drawer.Body>
          {detail?.order_id && (
            <Drawer.Footer>
              <Button size="small" variant="secondary" asChild>
                <Link to={`/orders/${detail.order_id}`}>{t("apaczka.list.openOrder")}</Link>
              </Button>
            </Drawer.Footer>
          )}
        </Drawer.Content>
      </Drawer>

      <PickupDrawer
        shipments={oneCourier ? pickupable : []}
        open={pickupOpen}
        onOpenChange={setPickupOpen}
        onBooked={() => setSelected(new Map())}
      />
    </div>
  )
}

const RowActions = ({ shipment, onDetails }: { shipment: Shipment; onDetails: () => void }) => {
  const { t } = useTranslation()
  const sync = useSyncShipment()

  if (!shipment.apaczka_order_id) {
    return (
      <Button size="small" variant="secondary" onClick={onDetails}>
        {t("apaczka.actions.createShipment")}
      </Button>
    )
  }

  const refresh = () =>
    sync.mutate(shipment.id, {
      onSuccess: () => toast.success(t("apaczka.toast.refreshed")),
      onError: (error) => toast.error(errorMessage(error)),
    })

  return (
    <div className="flex items-center gap-x-1">
      <IconButton size="small" variant="transparent" asChild>
        <a
          href={backendUrl(`/admin/apaczka/orders/${shipment.apaczka_order_id}/documents/waybill`)}
          target="_blank"
          rel="noreferrer"
          title={t("apaczka.actions.downloadLabel")}
        >
          <ArrowDownTray />
        </a>
      </IconButton>
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <IconButton size="small" variant="transparent">
            <EllipsisHorizontal />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item className="flex items-center gap-x-2" onClick={onDetails}>
            <DocumentText className="text-ui-fg-subtle" />
            {t("apaczka.list.details")}
          </DropdownMenu.Item>
          {shipment.tracking_url && (
            <DropdownMenu.Item asChild>
              <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="flex items-center gap-x-2">
                <ArrowUpRightOnBox className="text-ui-fg-subtle" />
                {t("apaczka.actions.track")}
              </a>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className="flex items-center gap-x-2" onClick={refresh} disabled={sync.isPending}>
            <ArrowPath className="text-ui-fg-subtle" />
            {t("apaczka.actions.refresh")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  )
}
