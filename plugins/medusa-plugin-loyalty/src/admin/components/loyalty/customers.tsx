import { Badge, Button, Container, Drawer, Heading, Input, Skeleton, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useCustomer, useCustomers, useGrantNewsletter, useSettings } from "../../lib/loyalty/api"
import { money, points, shortDate } from "../../lib/loyalty/format"
import { errorMessage } from "../../lib/loyalty/kit/format"
import { AdjustForm, Ledger } from "./ledger"

const PAGE = 20

/** "Customers": search, balance, tier, last activity; a row opens the full history. */
export const Customers = () => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const [opened, setOpened] = useState<string | null>(null)
  const { data, isLoading } = useCustomers({ q: q.trim(), offset, limit: PAGE })

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">{t("loyalty.customers.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("loyalty.customers.subtitle")}
          </Text>
        </div>
        <div className="w-64">
          <Input
            size="small"
            type="search"
            placeholder={t("loyalty.customers.search")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOffset(0)
            }}
          />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="m-6 h-24" />
      ) : (data?.customers ?? []).length === 0 ? (
        <Text className="text-ui-fg-subtle px-6 py-8 text-center">{t("loyalty.customers.empty")}</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("loyalty.customers.customer")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("loyalty.customers.balance")}</Table.HeaderCell>
              <Table.HeaderCell>{t("loyalty.customers.tier")}</Table.HeaderCell>
              <Table.HeaderCell>{t("loyalty.customers.lastActivity")}</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(data?.customers ?? []).map((row) => (
              <Table.Row key={row.id} className="cursor-pointer" onClick={() => setOpened(row.id)}>
                <Table.Cell>
                  <div className="flex flex-col">
                    <Text size="small" weight="plus">
                      {row.name ?? row.email}
                    </Text>
                    {row.name && (
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {row.email}
                      </Text>
                    )}
                    {row.excluded && (
                      <Badge size="2xsmall" color="grey" className="self-start">
                        {t("loyalty.customers.excluded")}
                      </Badge>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell className={`text-right font-mono ${row.balance < 0 ? "text-ui-fg-error" : ""}`}>
                  {points(row.balance, lang)}
                </Table.Cell>
                <Table.Cell>{row.tier?.name ?? "—"}</Table.Cell>
                <Table.Cell>{shortDate(row.last_activity_at, lang)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      {(data?.count ?? 0) > PAGE && (
        <div className="flex items-center justify-end gap-x-2 px-6 py-3">
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("loyalty.range", {
              from: offset + 1,
              to: Math.min(offset + PAGE, data?.count ?? 0),
              count: data?.count ?? 0,
            })}
          </Text>
          <Button size="small" variant="secondary" disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>
            {t("loyalty.previous")}
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={offset + PAGE >= (data?.count ?? 0)}
            onClick={() => setOffset(offset + PAGE)}
          >
            {t("loyalty.next")}
          </Button>
        </div>
      )}
      <Drawer open={!!opened} onOpenChange={(open) => !open && setOpened(null)}>
        <Drawer.Content className="max-w-3xl">
          <Drawer.Header>
            <Drawer.Title>{t("loyalty.customers.historyTitle")}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">{opened && <CustomerLoyalty customerId={opened} />}</Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}

/** One customer: summary, manual correction, ledger, tier history and redemptions. Also used by the customer widget. */
export const CustomerLoyalty = ({ customerId, compact = false }: { customerId: string; compact?: boolean }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { data, isLoading } = useCustomer(customerId)
  const newsletter = useGrantNewsletter(customerId)
  const settings = useSettings()
  const tierName = (id: string | null) =>
    (settings.data?.enabled ? settings.data.settings.tiers.levels.find((tier) => tier.id === id)?.name : null) ??
    id ??
    "—"
  if (isLoading || !data) return <Skeleton className="h-32" />
  const s = data.summary

  return (
    <div className="flex flex-col gap-y-5">
      {!s.member && (
        <Text size="small" className="text-ui-fg-error">
          {t(`loyalty.customers.notMember.${s.not_member_reason ?? "guest"}`)}
        </Text>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fact
          label={t("loyalty.customers.balance")}
          value={t("loyalty.pointsShort", { points: points(s.balance, lang) })}
          danger={s.balance < 0}
        />
        <Fact label={t("loyalty.customers.tier")} value={s.tier?.name ?? "—"} />
        <Fact
          label={t("loyalty.customers.nextTier")}
          value={
            s.next_tier
              ? t("loyalty.customers.missing", {
                  amount: money(s.next_tier.remaining, s.currency_code, lang),
                  tier: s.next_tier.name,
                })
              : "—"
          }
        />
        <Fact label={t("loyalty.customers.expires")} value={shortDate(s.expires_at, lang)} />
      </div>

      <div className="flex flex-col gap-y-2">
        <Heading level="h3">{t("loyalty.adjust.title")}</Heading>
        <AdjustForm customerId={customerId} />
        <Button
          size="small"
          variant="secondary"
          className="self-start"
          isLoading={newsletter.isPending}
          onClick={() =>
            newsletter.mutate(undefined, {
              onSuccess: (r) =>
                r.granted
                  ? toast.success(t("loyalty.customers.newsletterGranted", { points: r.points }))
                  : toast.info(t("loyalty.customers.newsletterNot")),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          {t("loyalty.customers.newsletter")}
        </Button>
      </div>

      <div className="flex flex-col gap-y-2">
        <Heading level="h3">{t("loyalty.ledger.title")}</Heading>
        <Ledger customerId={customerId} compact={compact} pageSize={compact ? 10 : 20} />
      </div>

      {!compact && data.redemptions.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Heading level="h3">{t("loyalty.customers.redemptions")}</Heading>
          <Table>
            <Table.Body>
              {data.redemptions.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell>{shortDate(r.created_at, lang)}</Table.Cell>
                  <Table.Cell>{r.reward_name}</Table.Cell>
                  <Table.Cell className="font-mono">{r.code ?? "—"}</Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall">{t(`loyalty.redemptionStatus.${r.status}`)}</Badge>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {t("loyalty.pointsShort", { points: points(r.cost, lang) })}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {!compact && data.tier_changes.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Heading level="h3">{t("loyalty.customers.tierHistory")}</Heading>
          {data.tier_changes.map((c) => (
            <Text key={c.id} size="small">
              {shortDate(c.created_at, lang)}: {tierName(c.from_tier_id)} → {tierName(c.to_tier_id)} (
              {money(c.spend, s.currency_code, lang)})
            </Text>
          ))}
        </div>
      )}
    </div>
  )
}

const Fact = ({ label, value, danger }: { label: string; value: string; danger?: boolean }) => (
  <div className="flex flex-col rounded-lg border border-ui-border-base p-3">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" weight="plus" className={danger ? "text-ui-fg-error" : undefined}>
      {value}
    </Text>
  </div>
)
