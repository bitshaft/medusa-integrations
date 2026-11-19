import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Heading,
  Label,
  RadioGroup,
  Switch,
  Table,
  Tabs,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type FillRequest,
  type FillScope,
  type PlanRow,
  type Preview,
  useApply,
  usePreview,
  useSettings,
} from "../../lib/currency/api"
import { formatDate } from "../../lib/currency/kit/format"
import { errorMessage } from "../../lib/currency/kit/format"
import { TAB_CLASS } from "../../lib/currency/kit/ui"
import { formatMoney, formatPercent, formatRate } from "../../lib/currency/format"
import { ActionBadge, MarginText, RateCell, Warnings } from "./shared"

const PAGE = 50
type Filter = "all" | "write" | "skip"

/**
 * "Fill prices" for a scope: the options, the preview, and the save of
 * exactly that preview. Changing an option drops the preview, so what is
 * saved is always what is on screen.
 */
export const FillPanel = ({ scope, onSaved }: { scope: FillScope | null; onSaved?: () => void }) => {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const preview = usePreview()
  const apply = useApply()
  const prompt = usePrompt()

  const store = settings.data?.store
  const base = store?.base ?? null
  const targets = useMemo(
    () =>
      (store?.currencies ?? []).filter((c) => c.code !== base?.code && settings.data?.rules[c.code]?.enabled !== false),
    [store, base, settings.data]
  )
  const [currencies, setCurrencies] = useState<string[] | null>(null)
  const chosen = currencies ?? targets.map((c) => c.code)
  const [overwrite, setOverwrite] = useState(false)
  const [priceLists, setPriceLists] = useState(false)
  const [regionPrices, setRegionPrices] = useState(true)
  const [shown, setShown] = useState<{ request: FillRequest; preview: Preview } | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [page, setPage] = useState(0)

  const scopeKey = JSON.stringify(scope)
  // Any change of what would be filled makes the preview on screen outdated.
  useEffect(() => setShown(null), [scopeKey, overwrite, priceLists, regionPrices, chosen.join(",")])

  const request = (allowStale = false): FillRequest | null =>
    scope
      ? {
          scope,
          currencies: chosen,
          overwrite,
          price_lists: priceLists,
          region_prices: regionPrices,
          allow_stale: allowStale,
        }
      : null

  const runPreview = async (body: FillRequest | null) => {
    if (!body) return
    try {
      const result = await preview.mutateAsync(body)
      setShown({ request: body, preview: result })
      setPage(0)
    } catch (error) {
      toast.error(t("currency.fill.previewFailed"), { description: errorMessage(error) })
    }
  }

  const save = async () => {
    if (!shown) return
    const { counts } = shown.preview.plan
    const confirmed = await prompt({
      variant: counts.overwrite ? "danger" : "confirmation",
      title: counts.overwrite ? t("currency.fill.confirmOverwriteTitle") : t("currency.fill.confirmTitle"),
      description: [
        t("currency.fill.confirmBody", { add: counts.add, overwrite: counts.overwrite }),
        counts.overwrite ? t("currency.fill.confirmOverwriteBody", { count: counts.overwrite }) : null,
        shown.preview.demo ? t("currency.fill.confirmDemo") : null,
      ]
        .filter(Boolean)
        .join(" "),
      confirmText: counts.overwrite ? t("currency.fill.confirmOverwrite") : t("currency.fill.save"),
      cancelText: t("currency.cancel"),
    })
    if (!confirmed) return
    try {
      const result = await apply.mutateAsync({
        ...shown.request,
        fingerprint: shown.preview.plan.fingerprint,
        confirm_overwrite: counts.overwrite > 0,
      })
      toast.success(result.demo ? t("currency.fill.savedDemo") : t("currency.fill.saved"), {
        description: t("currency.fill.savedBody", { add: result.counts.add, overwrite: result.counts.overwrite }),
      })
      setShown(null)
      onSaved?.()
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        toast.warning(t("currency.fill.changed"), { description: t("currency.fill.changedBody") })
        await runPreview(shown.request)
        return
      }
      toast.error(t("currency.fill.saveFailed"), { description: errorMessage(error) })
    }
  }

  if (settings.isLoading) return null
  if (!base || !targets.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle px-6 py-4">
        {t("currency.fill.noTargets")}
      </Text>
    )
  }

  const rows = shown?.preview.plan.rows ?? []
  const visible = rows.filter((row) =>
    filter === "all" ? true : filter === "write" ? row.action !== "skip" : row.action === "skip"
  )
  const pageRows = visible.slice(page * PAGE, page * PAGE + PAGE)
  const toWrite = shown ? shown.preview.plan.counts.add + shown.preview.plan.counts.overwrite : 0

  return (
    <div className="flex flex-col divide-y">
      {/* Options */}
      <div className="grid gap-6 px-6 py-4 md:grid-cols-3">
        <div className="flex flex-col gap-y-2">
          <Label size="small" weight="plus">
            {t("currency.fill.currencies")}
          </Label>
          {targets.map((currency) => (
            <div key={currency.code} className="flex items-center gap-x-2">
              <Checkbox
                id={`currency-${currency.code}`}
                checked={chosen.includes(currency.code)}
                onCheckedChange={(checked) =>
                  setCurrencies(checked ? [...chosen, currency.code] : chosen.filter((code) => code !== currency.code))
                }
              />
              <Label htmlFor={`currency-${currency.code}`} size="small">
                {currency.code.toUpperCase()} · {currency.name}
              </Label>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-y-2">
          <Label size="small" weight="plus">
            {t("currency.fill.which")}
          </Label>
          <RadioGroup value={overwrite ? "all" : "empty"} onValueChange={(value) => setOverwrite(value === "all")}>
            <div className="flex items-start gap-x-2">
              <RadioGroup.Item value="empty" id="fill-empty" />
              <Label htmlFor="fill-empty" size="small">
                {t("currency.fill.onlyEmpty")}
              </Label>
            </div>
            <div className="flex items-start gap-x-2">
              <RadioGroup.Item value="all" id="fill-all" />
              <div>
                <Label htmlFor="fill-all" size="small">
                  {t("currency.fill.overwrite")}
                </Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("currency.fill.overwriteHint")}
                </Text>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div className="flex flex-col gap-y-3">
          <div className="flex items-start gap-x-2">
            <Switch id="fill-lists" checked={priceLists} onCheckedChange={setPriceLists} />
            <div>
              <Label htmlFor="fill-lists" size="small">
                {t("currency.fill.priceLists")}
              </Label>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("currency.fill.priceListsHint")}
              </Text>
            </div>
          </div>
          <div className="flex items-start gap-x-2">
            <Switch id="fill-regions" checked={regionPrices} onCheckedChange={setRegionPrices} />
            <div>
              <Label htmlFor="fill-regions" size="small">
                {t("currency.fill.regionPrices")}
              </Label>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("currency.fill.regionPricesHint")}
              </Text>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          {scope ? t("currency.fill.previewHint", { base: base.code.toUpperCase() }) : t("currency.fill.chooseScope")}
        </Text>
        <Button
          size="small"
          variant={shown ? "secondary" : "primary"}
          disabled={!scope || !chosen.length}
          isLoading={preview.isPending}
          onClick={() => runPreview(request())}
        >
          {shown ? t("currency.fill.refreshPreview") : t("currency.fill.showPreview")}
        </Button>
      </div>

      {shown && (
        <>
          <RatesSummary shown={shown} onAllowStale={() => runPreview({ ...shown.request, allow_stale: true })} />

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <Tabs
              value={filter}
              onValueChange={(value) => {
                setFilter(value as Filter)
                setPage(0)
              }}
            >
              <Tabs.List>
                <Tabs.Trigger className={TAB_CLASS} value="all">
                  {t("currency.fill.filter.all")} <span className="text-ui-fg-muted">{rows.length}</span>
                </Tabs.Trigger>
                <Tabs.Trigger className={TAB_CLASS} value="write">
                  {t("currency.fill.filter.write")} <span className="text-ui-fg-muted">{toWrite}</span>
                </Tabs.Trigger>
                <Tabs.Trigger className={TAB_CLASS} value="skip">
                  {t("currency.fill.filter.skip")}{" "}
                  <span className="text-ui-fg-muted">{shown.preview.plan.counts.skip}</span>
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <Badge size="2xsmall" color="green">
                {t("currency.fill.countAdd", { count: shown.preview.plan.counts.add })}
              </Badge>
              <Badge size="2xsmall" color="orange">
                {t("currency.fill.countOverwrite", { count: shown.preview.plan.counts.overwrite })}
              </Badge>
              <Badge size="2xsmall" color="grey">
                {t("currency.fill.countSkip", { count: shown.preview.plan.counts.skip })}
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("currency.col.variant")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("currency.col.base")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("currency.col.currency")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("currency.col.rate")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("currency.col.margin")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("currency.col.new")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">{t("currency.col.current")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("currency.col.action")}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {pageRows.map((row) => (
                  <PreviewRow key={row.key} row={row} base={base.code} locale={i18n.language} />
                ))}
              </Table.Body>
            </Table>
          </div>
          {visible.length > PAGE && (
            <div className="flex items-center justify-end gap-x-2 px-6 py-3">
              <Text size="small" className="text-ui-fg-subtle">
                {t("currency.fill.page", {
                  from: page * PAGE + 1,
                  to: Math.min(visible.length, page * PAGE + PAGE),
                  count: visible.length,
                })}
              </Text>
              <Button size="small" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                {t("currency.previous")}
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={(page + 1) * PAGE >= visible.length}
                onClick={() => setPage(page + 1)}
              >
                {t("currency.next")}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {shown.preview.demo ? t("currency.fill.demoNote") : t("currency.fill.exactNote")}
            </Text>
            <Button size="small" disabled={!toWrite} isLoading={apply.isPending} onClick={save}>
              {t("currency.fill.saveCount", { count: toWrite })}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

const PreviewRow = ({ row, base, locale }: { row: PlanRow; base: string; locale: string }) => {
  const { t } = useTranslation()
  const where = [
    row.price_list_title ? t("currency.fill.inList", { title: row.price_list_title }) : null,
    row.region_name ? t("currency.fill.inRegion", { name: row.region_name }) : null,
    row.min_quantity || row.max_quantity
      ? t("currency.fill.quantity", { min: row.min_quantity ?? "1", max: row.max_quantity ?? "∞" })
      : null,
  ].filter(Boolean)
  return (
    <Table.Row>
      <Table.Cell className="max-w-[260px] py-2">
        <Text size="small" weight="plus" className="truncate">
          {row.product_title}
        </Text>
        <Text size="xsmall" className="text-ui-fg-subtle truncate">
          {[row.variant_title, row.sku].filter(Boolean).join(" · ")}
        </Text>
        {where.length > 0 && (
          <Text size="xsmall" className="text-ui-fg-muted truncate">
            {where.join(" · ")}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell className="text-right whitespace-nowrap">
        <Text size="small">{formatMoney(row.base_amount, base, locale)}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text size="small">{row.currency.toUpperCase()}</Text>
      </Table.Cell>
      <Table.Cell>
        <RateCell rate={row.rate} base={base} />
      </Table.Cell>
      <Table.Cell>
        <MarginText rate={row.rate} />
      </Table.Cell>
      <Table.Cell className="text-right">
        <div className="flex flex-col items-end gap-y-1">
          <Text size="small" weight="plus" className="whitespace-nowrap">
            {formatMoney(row.new_amount, row.currency, locale)}
          </Text>
          <Warnings row={row} />
        </div>
      </Table.Cell>
      <Table.Cell className="text-right">
        <Text size="small" className="whitespace-nowrap">
          {row.current ? formatMoney(row.current.amount, row.currency, locale) : "—"}
        </Text>
        {row.current && (
          <Text size="xsmall" className="text-ui-fg-subtle whitespace-nowrap">
            {row.current.origin.kind === "manual"
              ? t("currency.origin.manual")
              : t("currency.origin.filledShort", { date: formatDate(row.current.origin.at, locale) })}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>
        <ActionBadge row={row} />
      </Table.Cell>
    </Table.Row>
  )
}

/** The rates the preview used, and what to do when the source did not answer. */
const RatesSummary = ({
  shown,
  onAllowStale,
}: {
  shown: { request: FillRequest; preview: Preview }
  onAllowStale: () => void
}) => {
  const { t, i18n } = useTranslation()
  const { preview } = shown
  const lookup = preview.rates
  const base = preview.base.code
  return (
    <div className="flex flex-col gap-y-3 px-6 py-4">
      <Heading level="h3">{t("currency.fill.ratesTitle")}</Heading>
      {lookup?.status === "stale" && !shown.request.allow_stale && lookup.table && (
        <Alert variant="warning">
          <div className="flex flex-col gap-y-2">
            <Text size="small">
              {t("currency.fill.staleBody", {
                date: formatDate(lookup.table.date, i18n.language),
                table: lookup.table.table,
              })}
            </Text>
            <div>
              <Button size="small" variant="secondary" onClick={onAllowStale}>
                {t("currency.fill.useStale", { date: formatDate(lookup.table.date, i18n.language) })}
              </Button>
            </div>
          </div>
        </Alert>
      )}
      {lookup?.status === "stale" && shown.request.allow_stale && lookup.table && (
        <Alert variant="warning">
          {t("currency.fill.usingStale", {
            date: formatDate(lookup.table.date, i18n.language),
            table: lookup.table.table,
          })}
        </Alert>
      )}
      {lookup?.status === "unavailable" && <Alert variant="error">{t("currency.fill.unavailable")}</Alert>}
      <div className="flex flex-col gap-y-1">
        {preview.targets.map((target) => (
          <Text key={target.code} size="small">
            <span className="font-medium">{target.code.toUpperCase()}</span>
            {": "}
            {target.rate.ok
              ? [
                  formatRate(target.rate.rate.rate, target.code, base, i18n.language),
                  target.rate.rate.source
                    ? t("currency.rate.source", {
                        table: target.rate.rate.source.table,
                        date: formatDate(target.rate.rate.source.date, i18n.language),
                      })
                    : t("currency.rate.fixed"),
                  target.rate.rate.mode === "api_margin"
                    ? t("currency.rate.margin", { margin: formatPercent(target.rate.rate.margin, i18n.language) })
                    : null,
                  t(`currency.rounding.${target.rule.rounding}`),
                  t(`currency.tax.mode.${target.rule.tax}`),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t(`currency.reason.${target.rate.reason}`)}
          </Text>
        ))}
      </div>
    </div>
  )
}
