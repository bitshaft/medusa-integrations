import { ArrowDownTray } from "@medusajs/icons"
import { Badge, Button, Input, Label, Select, Skeleton, Table, Text, Textarea, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { type EntryType, entriesCsvUrl, useAdjust, useEntries } from "../../lib/loyalty/api"
import { adminLocale, points, requestId, shortDate } from "../../lib/loyalty/format"
import { errorMessage } from "../../lib/loyalty/kit/format"

const TYPES: EntryType[] = ["order", "action", "redemption", "return", "expiry", "adjustment", "tier_bonus"]
const ALL = "all"

/** The full points ledger of one customer: filters by type and date, paging, CSV. */
export const Ledger = ({
  customerId,
  pageSize = 20,
  compact = false,
}: {
  customerId: string
  pageSize?: number
  compact?: boolean
}) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [type, setType] = useState<string>(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [offset, setOffset] = useState(0)
  const filters = { type: type === ALL ? undefined : (type as EntryType), from: from || undefined, to: to || undefined }
  const { data, isLoading } = useEntries(customerId, { ...filters, offset, limit: pageSize })
  const rows = data?.entries ?? []

  return (
    <div className="flex flex-col gap-y-3">
      {!compact && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex w-48 flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("loyalty.ledger.type")}
            </Label>
            <Select
              size="small"
              value={type}
              onValueChange={(v) => {
                setType(v)
                setOffset(0)
              }}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>{t("loyalty.ledger.allTypes")}</Select.Item>
                {TYPES.map((key) => (
                  <Select.Item key={key} value={key}>
                    {t(`loyalty.types.${key}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("loyalty.ledger.from")}
            </Label>
            <Input
              size="small"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setOffset(0)
              }}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("loyalty.ledger.to")}
            </Label>
            <Input
              size="small"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setOffset(0)
              }}
            />
          </div>
          <Button size="small" variant="secondary" asChild>
            <a href={entriesCsvUrl(customerId, filters, adminLocale(lang))} download>
              <ArrowDownTray />
              {t("loyalty.ledger.csv")}
            </a>
          </Button>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : rows.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          {t("loyalty.ledger.empty")}
        </Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("loyalty.ledger.date")}</Table.HeaderCell>
                <Table.HeaderCell>{t("loyalty.ledger.what")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("loyalty.ledger.points")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("loyalty.ledger.balance")}</Table.HeaderCell>
                {!compact && <Table.HeaderCell>{t("loyalty.ledger.by")}</Table.HeaderCell>}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((entry) => (
                <Table.Row key={entry.id}>
                  <Table.Cell className="whitespace-nowrap">{shortDate(entry.created_at, lang)}</Table.Cell>
                  <Table.Cell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge size="2xsmall">{t(`loyalty.types.${entry.type}`)}</Badge>
                      <Text size="small">{t(`loyalty.reasons.${entry.reason}`)}</Text>
                      {(entry.description || entry.code) && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {[entry.description, entry.code].filter(Boolean).join(" · ")}
                        </Text>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell
                    className={`text-right font-mono ${entry.points < 0 ? "text-ui-fg-error" : "text-ui-fg-interactive"}`}
                  >
                    {entry.points > 0 ? "+" : ""}
                    {points(entry.points, lang)}
                  </Table.Cell>
                  <Table.Cell className="text-right font-mono">{points(entry.balance_after, lang)}</Table.Cell>
                  {!compact && <Table.Cell>{t(`loyalty.actors.${entry.actor_type}`)}</Table.Cell>}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      {(data?.count ?? 0) > pageSize && (
        <div className="flex items-center justify-end gap-x-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("loyalty.range", {
              from: offset + 1,
              to: Math.min(offset + pageSize, data?.count ?? 0),
              count: data?.count ?? 0,
            })}
          </Text>
          <Button
            size="small"
            variant="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            {t("loyalty.previous")}
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={offset + pageSize >= (data?.count ?? 0)}
            onClick={() => setOffset(offset + pageSize)}
          >
            {t("loyalty.next")}
          </Button>
        </div>
      )}
    </div>
  )
}

/** A manual correction: whole points, plus or minus, with a required reason. */
export const AdjustForm = ({ customerId }: { customerId: string }) => {
  const { t } = useTranslation()
  const adjust = useAdjust(customerId)
  const [value, setValue] = useState("")
  const [reason, setReason] = useState("")
  const [formId, setFormId] = useState(requestId)
  const amount = Number(value)
  const valid = Number.isInteger(amount) && amount !== 0 && reason.trim().length >= 3

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-y-1">
          <Label size="xsmall" weight="plus">
            {t("loyalty.adjust.points")}
          </Label>
          <Input
            size="small"
            type="number"
            step={1}
            className="w-32"
            placeholder="-50 / 100"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex min-w-64 flex-1 flex-col gap-y-1">
          <Label size="xsmall" weight="plus">
            {t("loyalty.adjust.reason")}
          </Label>
          <Textarea
            rows={1}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("loyalty.adjust.reasonPlaceholder")}
          />
        </div>
        <Button
          size="small"
          disabled={!valid}
          isLoading={adjust.isPending}
          onClick={() =>
            adjust.mutate(
              { points: amount, reason: reason.trim(), request_id: formId },
              {
                onSuccess: (r) => {
                  toast.success(t("loyalty.adjust.done", { balance: r.balance }))
                  setValue("")
                  setReason("")
                  setFormId(requestId())
                },
                onError: (error) => toast.error(errorMessage(error)),
              }
            )
          }
        >
          {t("loyalty.adjust.save")}
        </Button>
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {t("loyalty.adjust.hint")}
      </Text>
    </div>
  )
}
