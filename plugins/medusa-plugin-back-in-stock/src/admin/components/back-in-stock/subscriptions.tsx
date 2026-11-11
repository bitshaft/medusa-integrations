import { Badge, Button, Container, Heading, Input, Select, Skeleton, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type Subscription,
  type SubscriptionStatus,
  useEndSubscription,
  useSubscriptions,
} from "../../lib/back-in-stock/api"
import { errorMessage, formatDateTime } from "../../lib/back-in-stock/kit/format"
import { DemoBadge, Pager, SubscriptionBadge, VariantCell } from "./shared"

const PAGE = 20
const ALL = "all"
const STATUSES: SubscriptionStatus[] = ["active", "pending", "purchased", "unsubscribed", "expired"]
type Scope = "all" | "real" | "demo"

/** Every subscription with how many emails it got and when; filters by status, email and demo data. */
export const Subscriptions = () => {
  const { t, i18n } = useTranslation()
  const prompt = usePrompt()
  const [status, setStatus] = useState<string>(ALL)
  const [scope, setScope] = useState<Scope>("real")
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const { data, isLoading, isError } = useSubscriptions(
    {
      limit: PAGE,
      offset,
      status: status === ALL ? undefined : (status as SubscriptionStatus),
      q: search.trim(),
      demo: scope === "all" ? undefined : scope === "demo",
    },
    true
  )
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
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("back-in-stock.subscriptions.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("back-in-stock.subscriptions.subtitle")}
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
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
        <div className="w-52">
          <Select
            size="small"
            value={status}
            onValueChange={(value) => {
              setStatus(value)
              setOffset(0)
            }}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>{t("back-in-stock.all")}</Select.Item>
              {STATUSES.map((value) => (
                <Select.Item key={value} value={value}>
                  {t(`back-in-stock.status.${value}`)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div className="w-44">
          <Select
            size="small"
            value={scope}
            onValueChange={(value) => {
              setScope(value as Scope)
              setOffset(0)
            }}
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
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          {t("back-in-stock.subscriptions.empty")}
        </Text>
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
