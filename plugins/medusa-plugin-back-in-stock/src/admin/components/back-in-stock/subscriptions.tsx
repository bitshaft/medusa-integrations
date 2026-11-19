import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Select,
  Skeleton,
  Table,
  Tabs,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import {
  type StatusCounts,
  type Subscription,
  type SubscriptionStatus,
  useEndSubscription,
  useSubscriptions,
  useVariantLabel,
} from "../../lib/back-in-stock/api"
import { errorMessage, formatDateTime } from "../../lib/back-in-stock/kit/format"
import { useDebounced } from "../../lib/back-in-stock/kit/hooks"
import { Empty } from "../../lib/back-in-stock/kit/page"
import { TAB_CLASS } from "../../lib/back-in-stock/kit/ui"
import { type Chip, FilterChips, ProductFilter, useProductChips } from "./filters"
import { DemoBadge, Pager, SubscriptionBadge, VariantCell } from "./shared"

const PAGE = 20
const ALL = "all"
const STATUSES: SubscriptionStatus[] = ["active", "pending", "purchased", "unsubscribed", "expired"]
const SCOPES = ["real", "demo", "all"] as const
type Scope = (typeof SCOPES)[number]

/**
 * Every subscription with how many emails it got and when. Status, demo
 * data and the variant live in the URL (`?status=&scope=&variant=`), so a
 * row of "Most wanted" can open this tab on the people waiting for it.
 */
export const Subscriptions = () => {
  const { t, i18n } = useTranslation()
  const prompt = usePrompt()
  const [params, setParams] = useSearchParams()
  const rawStatus = params.get("status")
  const status = rawStatus && (STATUSES as string[]).includes(rawStatus) ? (rawStatus as SubscriptionStatus) : ALL
  const rawScope = params.get("scope") as Scope | null
  const scope: Scope = rawScope && SCOPES.includes(rawScope) ? rawScope : "real"
  const variant = params.get("variant")
  const [products, setProducts] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const query = useDebounced(search.trim())

  const setParam = (name: string, value: string | null) => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (value === null) copy.delete(name)
        else copy.set(name, value)
        return copy
      },
      { replace: true }
    )
    setOffset(0)
  }
  const filterProducts = (ids: string[]) => {
    setProducts(ids)
    setOffset(0)
  }

  const { data, isLoading, isError } = useSubscriptions(
    {
      limit: PAGE,
      offset,
      status: status === ALL ? undefined : status,
      q: query,
      variant_id: variant ?? undefined,
      product_id: products,
      demo: scope === "all" ? undefined : scope === "demo",
    },
    true
  )
  const variantLabel = useVariantLabel(variant)
  const productChips = useProductChips(products, filterProducts)
  const chips: Chip[] = [
    ...(variant
      ? [
          {
            key: `variant:${variant}`,
            label: t("back-in-stock.filters.variant", { label: variantLabel.data ?? variant }),
            onRemove: () => setParam("variant", null),
          },
        ]
      : []),
    ...productChips,
  ]
  const end = useEndSubscription()
  const rows = data?.subscriptions ?? []

  const onEnd = async (row: Subscription) => {
    const confirmed = await prompt({
      title: t("back-in-stock.subscriptions.endConfirmTitle"),
      description: t("back-in-stock.subscriptions.endConfirmText", {
        email: row.email ?? "",
        product: row.product.label,
      }),
      confirmText: t("back-in-stock.subscriptions.end"),
      cancelText: t("back-in-stock.settings.cancel"),
    })
    if (confirmed) {
      end.mutate(row.id, {
        onSuccess: () => toast.success(t("back-in-stock.subscriptions.ended")),
        onError: (error) => toast.error(t("back-in-stock.subscriptions.endFailed", { error: errorMessage(error) })),
      })
    }
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">{t("back-in-stock.subscriptions.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("back-in-stock.subscriptions.subtitle")}
          </Text>
        </div>
        <div className="w-64">
          <Input
            size="small"
            type="search"
            placeholder={t("back-in-stock.subscriptions.search")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Tabs value={status} onValueChange={(value) => setParam("status", value === ALL ? null : value)}>
          <Tabs.List>
            {[ALL, ...STATUSES].map((value) => (
              <Tabs.Trigger className={TAB_CLASS} key={value} value={value}>
                {value === ALL ? t("back-in-stock.all") : t(`back-in-stock.status.${value}`)}
                {data?.counts && <span className="text-ui-fg-muted">{data.counts[value as keyof StatusCounts]}</span>}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
        <div className="flex items-center gap-2">
          <ProductFilter value={products} onChange={filterProducts} />
          <div className="w-44">
            <Select
              size="small"
              value={scope}
              onValueChange={(value) => setParam("scope", value === "real" ? null : value)}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="real">{t("back-in-stock.subscriptions.realOnly")}</Select.Item>
                <Select.Item value="demo">{t("back-in-stock.subscriptions.demoOnly")}</Select.Item>
                <Select.Item value="all">{t("back-in-stock.all")}</Select.Item>
              </Select.Content>
            </Select>
          </div>
        </div>
      </div>
      <FilterChips chips={chips} />

      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {t("back-in-stock.loadError")}
        </Text>
      )}
      {!isLoading && !isError && !rows.length && (
        <div className="px-6 py-4">
          <Empty>{t("back-in-stock.subscriptions.empty")}</Empty>
        </div>
      )}

      {rows.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("back-in-stock.subscriptions.email")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.subscriptions.variant")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.subscriptions.status")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">
                {t("back-in-stock.subscriptions.notifications")}
              </Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.subscriptions.lastNotified")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.subscriptions.created")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell className="py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {row.anonymized ? (
                      <Badge size="2xsmall">{t("back-in-stock.anonymized")}</Badge>
                    ) : (
                      <Text size="small">{row.email}</Text>
                    )}
                    {row.demo && <DemoBadge />}
                  </div>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {row.sales_channel_name} · {row.locale.toUpperCase()}
                  </Text>
                </Table.Cell>
                <Table.Cell className="max-w-[320px] py-2">
                  <VariantCell product={row.product} />
                </Table.Cell>
                <Table.Cell>
                  <SubscriptionBadge status={row.status} />
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Text size="small">{row.notification_count}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {row.last_notified_at
                      ? formatDateTime(row.last_notified_at, i18n.language)
                      : t("back-in-stock.subscriptions.never")}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {formatDateTime(row.created_at, i18n.language)}
                  </Text>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {(row.status === "active" || row.status === "pending") && (
                    <Button
                      size="small"
                      variant="transparent"
                      isLoading={end.isPending && end.variables === row.id}
                      onClick={() => onEnd(row)}
                    >
                      {t("back-in-stock.subscriptions.end")}
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Pager offset={offset} limit={PAGE} count={data?.count ?? 0} onChange={setOffset} />
    </Container>
  )
}
