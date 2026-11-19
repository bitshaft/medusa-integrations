import { Badge, Text, Tooltip } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { PlanRow, RateLookup, ResolvedRate, Warning } from "../../lib/currency/api"
import { formatDate, formatDateTime } from "../../lib/currency/kit/format"
import { formatPercent, formatRate } from "../../lib/currency/format"

export const BRAND_COLOR = "#4f46e5"

/** Add / overwrite / skip, coloured. */
export const ActionBadge = ({ row }: { row: Pick<PlanRow, "action" | "reason"> }) => {
  const { t } = useTranslation()
  const color = row.action === "add" ? "green" : row.action === "overwrite" ? "orange" : "grey"
  return (
    <div className="flex flex-col items-start gap-y-0.5">
      <Badge size="2xsmall" color={color}>
        {t(`currency.action.${row.action}`)}
      </Badge>
      {row.reason && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t(`currency.reason.${row.reason}`)}
        </Text>
      )}
    </div>
  )
}

/** `1 EUR = 4,4165 PLN`, and under it the table and its date (or "fixed rate"). */
export const RateCell = ({ rate, base }: { rate: ResolvedRate | null; base: string }) => {
  const { t, i18n } = useTranslation()
  if (!rate) return <Text size="small">—</Text>
  return (
    <div className="flex flex-col">
      <Text size="small" className="whitespace-nowrap">
        {formatRate(rate.rate, rate.currency, base, i18n.language)}
      </Text>
      <Text size="xsmall" className={rate.source?.stale ? "text-ui-tag-orange-text" : "text-ui-fg-subtle"}>
        {rate.source
          ? t("currency.rate.source", { table: rate.source.table, date: formatDate(rate.source.date, i18n.language) })
          : t("currency.rate.fixed")}
      </Text>
    </div>
  )
}

export const MarginText = ({ rate }: { rate: ResolvedRate | null }) => {
  const { i18n } = useTranslation()
  if (!rate || rate.mode !== "api_margin") return <Text size="small">—</Text>
  return <Text size="small">{formatPercent(rate.margin, i18n.language)}</Text>
}

/** Small notes under a new price: VAT rates that differ, a stale rate, a rounding that fell back. */
export const Warnings = ({ row }: { row: Pick<PlanRow, "warnings" | "tax_rates" | "tax"> }) => {
  const { t } = useTranslation()
  if (!row.warnings.length && row.tax !== "net" && row.tax !== "strip" && row.tax !== "add") return null
  return (
    <div className="flex flex-wrap gap-1">
      {row.warnings.map((warning: Warning) => (
        <Tooltip
          key={warning}
          content={t(`currency.warning.${warning}Hint`, { base: row.tax_rates?.base, target: row.tax_rates?.target })}
        >
          <Badge size="2xsmall" color="orange">
            {t(`currency.warning.${warning}`, { base: row.tax_rates?.base, target: row.tax_rates?.target })}
          </Badge>
        </Tooltip>
      ))}
      {(row.tax === "net" || row.tax === "strip" || row.tax === "add") && (
        <Badge size="2xsmall" color="blue">
          {t(`currency.tax.step.${row.tax}`, { base: row.tax_rates?.base, target: row.tax_rates?.target })}
        </Badge>
      )}
    </div>
  )
}

/** Where the table comes from and how current it is. */
export const RateStatusBadge = ({ lookup }: { lookup: Pick<RateLookup, "status"> }) => {
  const { t } = useTranslation()
  const color = { fresh: "green", stale: "orange", unavailable: "red", demo: "orange" } as const
  return (
    <Badge size="2xsmall" color={color[lookup.status]}>
      {t(`currency.rates.status.${lookup.status}`)}
    </Badge>
  )
}

/** "Checked 19 Nov 2026, 12:40 · next table expected 20 Nov 2026, 12:30". */
export const RateTimes = ({ lookup }: { lookup: RateLookup }) => {
  const { t, i18n } = useTranslation()
  const parts = [
    lookup.checked_at ? t("currency.rates.checked", { date: formatDateTime(lookup.checked_at, i18n.language) }) : null,
    lookup.next_expected
      ? t("currency.rates.next", { date: formatDateTime(lookup.next_expected, i18n.language) })
      : null,
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <Text size="xsmall" className="text-ui-fg-subtle">
      {parts.join(" · ")}
    </Text>
  )
}
