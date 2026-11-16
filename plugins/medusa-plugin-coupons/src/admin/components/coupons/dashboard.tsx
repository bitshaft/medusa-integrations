import {
  ArrowDownTray,
  ArrowUpRightOnBox,
  PauseSolid,
  PencilSquare,
  PlaySolid,
  SquareTwoStack,
  Trash,
} from "@medusajs/icons"
import {
  Badge,
  Button,
  clx,
  Container,
  Drawer,
  Heading,
  IconButton,
  Input,
  Skeleton,
  Table,
  Text,
  toast,
  Tooltip,
  usePrompt,
} from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import {
  batchCsvUrl,
  type CouponFilter,
  type CouponView,
  useBatchCodes,
  useCouponOrders,
  useCoupons,
  useDeleteCoupon,
  useDuplicate,
  useSetStatus,
} from "../../lib/coupons/api"
import { adminLocale, money, shortDate } from "../../lib/coupons/draft"
import { errorMessage } from "../../lib/coupons/kit/format"
import { StatusBadge } from "./shared"

const FILTERS: CouponFilter[] = ["all", "active", "scheduled", "paused", "ended", "expiring", "automatic"]

export const Dashboard = ({ onEdit, currencyCode }: { onEdit: (coupon: CouponView) => void; currencyCode: string }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const locale = adminLocale(lang)
  const navigate = useNavigate()
  const prompt = usePrompt()
  const [filter, setFilter] = useState<CouponFilter>("all")
  const [q, setQ] = useState("")
  const [opened, setOpened] = useState<CouponView | null>(null)
  const list = useCoupons({ filter, q: q.trim() })
  const setStatus = useSetStatus()
  const duplicate = useDuplicate()
  const remove = useDeleteCoupon()

  const data = list.data
  const cards = data?.cards
  const currency = cards?.currency_code ?? currencyCode

  const onDelete = async (coupon: CouponView) => {
    const ok = await prompt({
      title: t("coupons.list.deleteTitle"),
      description: t("coupons.list.deleteText", { code: coupon.automatic ? coupon.sentence[locale] : coupon.code }),
      confirmText: t("coupons.list.delete"),
      cancelText: t("coupons.cancel"),
    })
    if (!ok) return
    remove.mutate(coupon.id, {
      onSuccess: () => toast.success(t("coupons.list.deleted")),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const onToggle = (coupon: CouponView) =>
    setStatus.mutate(
      { id: coupon.id, status: coupon.status === "paused" ? "active" : "paused" },
      {
        onSuccess: () => toast.success(t(coupon.status === "paused" ? "coupons.list.resumed" : "coupons.list.paused")),
        onError: (error) => toast.error(errorMessage(error)),
      }
    )

  const onDuplicate = (coupon: CouponView) =>
    duplicate.mutate(coupon.id, {
      onSuccess: () => toast.success(t("coupons.list.duplicated")),
      onError: (error) => toast.error(errorMessage(error)),
    })

  const tiles: Array<{ key: string; label: string; value: string; sub?: string; filter?: CouponFilter }> = cards
    ? [
        { key: "total", label: t("coupons.cards.total"), value: String(cards.total), filter: "all" },
        { key: "active", label: t("coupons.cards.active"), value: String(cards.active), filter: "active" },
        { key: "scheduled", label: t("coupons.cards.scheduled"), value: String(cards.scheduled), filter: "scheduled" },
        {
          key: "orders",
          label: t("coupons.cards.orders30"),
          value: String(cards.orders_30d),
          sub: t("coupons.cards.discount", { amount: money(cards.discount_30d, currency, lang) }),
        },
        { key: "expiring", label: t("coupons.cards.expiring"), value: String(cards.expiring), filter: "expiring" },
        { key: "automatic", label: t("coupons.cards.automatic"), value: String(cards.automatic), filter: "automatic" },
      ]
    : []

  return (
    <div className="flex flex-col gap-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {list.isLoading
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          : tiles.map((tile) => (
              <button
                key={tile.key}
                type="button"
                disabled={!tile.filter}
                onClick={() => tile.filter && setFilter(tile.filter)}
                className={clx(
                  "flex flex-col gap-y-1 rounded-lg border bg-ui-bg-base p-4 text-left shadow-elevation-card-rest",
                  tile.filter && filter === tile.filter ? "border-ui-border-interactive" : "border-transparent",
                  tile.filter && "hover:bg-ui-bg-base-hover"
                )}
              >
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {tile.label}
                </Text>
                <Text size="xlarge" weight="plus">
                  {tile.value}
                </Text>
                {tile.sub && (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {tile.sub}
                  </Text>
                )}
              </button>
            ))}
      </div>

      <Container className="overflow-hidden divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <Heading level="h2">{t("coupons.list.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("coupons.list.subtitle")}
            </Text>
          </div>
          <div className="w-64">
            <Input
              size="small"
              type="search"
              placeholder={t("coupons.list.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-6 py-3" role="tablist">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={clx(
                "txt-compact-small-plus flex items-center gap-x-2 rounded-md border px-3 py-1.5",
                filter === key
                  ? "border-ui-border-interactive bg-ui-bg-highlight"
                  : "border-ui-border-base hover:bg-ui-bg-base-hover"
              )}
            >
              {t(`coupons.filters.${key}`)}
              <Badge size="2xsmall">{data?.counts[key] ?? 0}</Badge>
            </button>
          ))}
        </div>

        {list.isError ? (
          <Text className="text-ui-fg-error px-6 py-4">{t("coupons.loadError")}</Text>
        ) : (data?.coupons ?? []).length === 0 && !list.isLoading ? (
          <Text className="text-ui-fg-subtle px-6 py-8 text-center">{t("coupons.list.empty")}</Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("coupons.list.code")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("coupons.list.sentence")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("coupons.list.uses")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("coupons.list.discount")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("coupons.list.orders")}</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {(data?.coupons ?? []).map((coupon) => (
                  <Table.Row
                    key={coupon.id}
                    className="cursor-pointer [&_td]:align-top"
                    onClick={() => setOpened(coupon)}
                  >
                    <Table.Cell className="py-3">
                      <div className="flex flex-col gap-y-1">
                        <Text size="small" weight="plus" className="font-mono">
                          {coupon.batch_size != null
                            ? t("coupons.list.batch", { count: coupon.batch_size })
                            : coupon.automatic
                              ? (coupon.name ?? t("coupons.list.automaticCoupon"))
                              : coupon.code}
                        </Text>
                        {coupon.name && !coupon.automatic && (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {coupon.name}
                          </Text>
                        )}
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge status={coupon.status} />
                          {coupon.automatic && (
                            <Badge size="2xsmall" color="purple">
                              {t("coupons.list.automatic")}
                            </Badge>
                          )}
                          {coupon.expiring && (
                            <Badge size="2xsmall" color="orange">
                              {t("coupons.filters.expiring")}
                            </Badge>
                          )}
                        </div>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {shortDate(coupon.created_at, lang)}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="max-w-[420px] whitespace-normal py-3">
                      <Text size="small">{coupon.sentence[locale]}</Text>
                    </Table.Cell>
                    <Table.Cell className="py-3">
                      <Text size="small">{t("coupons.list.usedCount", { count: coupon.used })}</Text>
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {coupon.limit != null
                          ? t("coupons.list.limit", { count: coupon.limit })
                          : t("coupons.list.noLimit")}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="py-3 text-right">
                      <Text size="small">{money(coupon.stats.discount, currency, lang)}</Text>
                    </Table.Cell>
                    <Table.Cell className="py-3 text-right">
                      <Text size="small">{coupon.stats.orders}</Text>
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {money(coupon.stats.revenue, currency, lang)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-x-1">
                        <Action label={t("coupons.list.edit")} onClick={() => onEdit(coupon)}>
                          <PencilSquare />
                        </Action>
                        <Action
                          label={coupon.status === "paused" ? t("coupons.list.resume") : t("coupons.list.pause")}
                          onClick={() => onToggle(coupon)}
                          disabled={coupon.status === "ended"}
                        >
                          {coupon.status === "paused" ? <PlaySolid /> : <PauseSolid />}
                        </Action>
                        <Action
                          label={t("coupons.list.duplicate")}
                          onClick={() => onDuplicate(coupon)}
                          disabled={coupon.batch_size != null}
                        >
                          <SquareTwoStack />
                        </Action>
                        <Action
                          label={t("coupons.list.openInMedusa")}
                          onClick={() => navigate(`/promotions/${coupon.promotion_ids[0]}`)}
                          disabled={!coupon.promotion_ids.length}
                        >
                          <ArrowUpRightOnBox />
                        </Action>
                        <Action label={t("coupons.list.delete")} onClick={() => onDelete(coupon)} danger>
                          <Trash />
                        </Action>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>

      <CouponDrawer coupon={opened} onClose={() => setOpened(null)} />
    </div>
  )
}

const Action = ({
  label,
  onClick,
  children,
  disabled,
  danger,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  danger?: boolean
}) => (
  <Tooltip content={label}>
    <IconButton
      size="small"
      variant="transparent"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={danger ? "text-ui-fg-error" : undefined}
    >
      {children}
    </IconButton>
  </Tooltip>
)

/** Clicking a row: the orders that used the coupon, or the codes of a batch. */
const CouponDrawer = ({ coupon, onClose }: { coupon: CouponView | null; onClose: () => void }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const locale = adminLocale(lang)
  const navigate = useNavigate()
  const isBatch = coupon?.batch_size != null
  const orders = useCouponOrders(coupon && !isBatch ? coupon.id : null)
  const codes = useBatchCodes(coupon && isBatch ? coupon.id : null)

  return (
    <Drawer open={!!coupon} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content className="sm:max-w-xl">
        <Drawer.Header>
          <Drawer.Title>
            {isBatch
              ? t("coupons.drawer.codesTitle")
              : t("coupons.drawer.ordersTitle", { code: coupon?.automatic ? "" : coupon?.code })}
          </Drawer.Title>
          <Drawer.Description>{coupon?.sentence[locale]}</Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="overflow-y-auto p-0">
          {isBatch ? (
            <>
              <div className="flex items-center justify-between px-6 py-3">
                <Text size="small" className="text-ui-fg-subtle">
                  {t("coupons.drawer.codesUsed", {
                    used: (codes.data?.codes ?? []).filter((c) => c.used).length,
                    total: codes.data?.codes.length ?? 0,
                  })}
                </Text>
                {coupon && (
                  <Button size="small" variant="secondary" asChild>
                    <a href={batchCsvUrl(coupon.id, locale)} download>
                      <ArrowDownTray />
                      {t("coupons.drawer.downloadCsv")}
                    </a>
                  </Button>
                )}
              </div>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("coupons.list.code")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("coupons.drawer.used")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("coupons.drawer.order")}</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {(codes.data?.codes ?? []).map((code) => (
                    <Table.Row key={code.code}>
                      <Table.Cell className="font-mono">{code.code}</Table.Cell>
                      <Table.Cell>
                        <Badge size="2xsmall" color={code.used ? "green" : "grey"}>
                          {code.used ? t("coupons.drawer.yes") : t("coupons.drawer.no")}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {code.order_id ? (
                          <button
                            type="button"
                            className="text-ui-fg-interactive"
                            onClick={() => navigate(`/orders/${code.order_id}`)}
                          >
                            #{code.order_display_id}
                          </button>
                        ) : (
                          "—"
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </>
          ) : orders.isLoading ? (
            <Skeleton className="m-6 h-24" />
          ) : (orders.data?.orders ?? []).length === 0 ? (
            <Text className="text-ui-fg-subtle px-6 py-8 text-center">{t("coupons.drawer.noOrders")}</Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("coupons.drawer.order")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("coupons.drawer.date")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("coupons.drawer.customer")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("coupons.list.discount")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("coupons.drawer.total")}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {(orders.data?.orders ?? []).map((order) => (
                  <Table.Row key={order.id} className="cursor-pointer" onClick={() => navigate(`/orders/${order.id}`)}>
                    <Table.Cell>#{order.display_id}</Table.Cell>
                    <Table.Cell>{shortDate(order.created_at, lang)}</Table.Cell>
                    <Table.Cell className="max-w-[160px] truncate">{order.email ?? "—"}</Table.Cell>
                    <Table.Cell className="text-right">{money(order.discount, order.currency_code, lang)}</Table.Cell>
                    <Table.Cell className="text-right">{money(order.total, order.currency_code, lang)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
