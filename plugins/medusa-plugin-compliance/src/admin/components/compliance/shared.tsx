import { ExclamationCircle, InformationCircleSolid } from "@medusajs/icons"
import { Badge, Input, Label, Select, StatusBadge, Switch, Text, Textarea } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { RequestStatus } from "../../lib/compliance/api"
import { languageLabel } from "../../lib/compliance/format"

/** Shown on every page of the panel while demo mode is on. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="flex items-start gap-x-3 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3"
    >
      <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
      <div>
        <Text size="small" weight="plus" className="text-ui-tag-orange-text">
          {t("compliance.demo.title")}
        </Text>
        <Text size="xsmall" className="text-ui-tag-orange-text">
          {t("compliance.demo.body")}
        </Text>
      </div>
    </div>
  )
}

/** A reminder that the plugin is a tool, not legal advice. */
export const LegalNote = ({ children }: { children?: ReactNode }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-x-2 rounded-lg bg-ui-bg-subtle px-4 py-3">
      <InformationCircleSolid className="mt-0.5 shrink-0 text-ui-fg-muted" />
      <Text size="xsmall" className="text-ui-fg-subtle">
        {children ?? t("compliance.legal.short")}
      </Text>
    </div>
  )
}

/**
 * Which language a field is being written in, like the e-mail editor's: the
 * store's languages, the default one first and marked "original". `note`
 * adds a word after a language, e.g. "empty". With one language there is
 * nothing to pick, so it only names it.
 */
export const LanguageSelect = ({
  languages,
  value,
  onChange,
  note,
}: {
  languages: string[]
  value: string
  onChange: (language: string) => void
  note?: (language: string) => string | null
}) => {
  const { t, i18n } = useTranslation()
  const label = (code: string) =>
    code === languages[0]
      ? t("compliance.languages.original", { language: languageLabel(code, i18n.language) })
      : languageLabel(code, i18n.language)
  if (languages.length < 2) {
    return (
      <Text size="small" className="shrink-0 text-ui-fg-subtle">
        {label(languages[0] ?? value)}
      </Text>
    )
  }
  return (
    <div className="w-60 shrink-0">
      <Select size="small" value={value} onValueChange={onChange}>
        <Select.Trigger aria-label={t("compliance.languages.language")}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {languages.map((code) => {
            const extra = note?.(code)
            return (
              <Select.Item key={code} value={code}>
                {label(code)}
                {extra && <span className="text-ui-fg-subtle"> · {extra}</span>}
              </Select.Item>
            )
          })}
        </Select.Content>
      </Select>
    </div>
  )
}

/** One number on the dashboard. */
export const Tile = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: "ok" | "warn" | "bad"
}) => (
  <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-base p-4 shadow-elevation-card-rest">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text
      size="xlarge"
      weight="plus"
      className={tone === "bad" ? "text-ui-fg-error" : tone === "warn" ? "text-ui-tag-orange-text" : undefined}
    >
      {value}
    </Text>
    {hint && (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

/** A titled block of a form or page. */
export const Section = ({
  title,
  hint,
  actions,
  children,
}: {
  title: string
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) => (
  <div className="flex flex-col gap-y-3 rounded-lg border border-ui-border-base p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <Text size="small" weight="plus">
          {title}
        </Text>
        {hint && (
          <Text size="xsmall" className="text-ui-fg-subtle">
            {hint}
          </Text>
        )}
      </div>
      {actions}
    </div>
    {children}
  </div>
)

export const TextField = ({
  label,
  value,
  onChange,
  hint,
  placeholder,
  type = "text",
  disabled,
}: {
  label: string
  value: string | null | undefined
  onChange: (value: string) => void
  hint?: string
  placeholder?: string
  type?: string
  disabled?: boolean
}) => (
  <div className="flex flex-col gap-y-1">
    <Label size="xsmall" weight="plus">
      {label}
    </Label>
    <Input
      size="small"
      type={type}
      aria-label={label}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
    {hint && (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

export const TextAreaField = ({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string
  value: string | null | undefined
  onChange: (value: string) => void
  hint?: string
  rows?: number
}) => (
  <div className="flex flex-col gap-y-1">
    <Label size="xsmall" weight="plus">
      {label}
    </Label>
    <Textarea aria-label={label} rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    {hint && (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

export const NumberField = ({
  label,
  value,
  onChange,
  min,
  suffix,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  suffix?: string
  hint?: string
}) => (
  <div className="flex flex-col gap-y-1">
    <Label size="xsmall" weight="plus">
      {label}
    </Label>
    <div className="flex items-center gap-x-2">
      <Input
        size="small"
        type="number"
        className="w-28"
        aria-label={label}
        min={min}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && (
        <Text size="small" className="text-ui-fg-subtle">
          {suffix}
        </Text>
      )}
    </div>
    {hint && (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

/** A switch with a label and a one-line explanation. */
export const Toggle = ({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: ReactNode
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) => (
  <label className="flex items-start gap-x-3">
    <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    <span className="flex flex-col">
      <Text size="small" weight="plus" as="span">
        {label}
      </Text>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle" as="span">
          {hint}
        </Text>
      )}
    </span>
  </label>
)

/** Missing GPSR fields as small badges. */
export const Gaps = ({ gaps }: { gaps: string[] }) => {
  const { t, i18n } = useTranslation()
  if (!gaps.length) {
    return <StatusBadge color="green">{t("compliance.gpsr.complete")}</StatusBadge>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {gaps.map((gap) => (
        <Badge key={gap} size="2xsmall" color="orange">
          {gap.startsWith("warnings.")
            ? t("compliance.gpsr.gaps.warningsIn", { language: languageLabel(gap.slice(9), i18n.language) })
            : t(`compliance.gpsr.gaps.${gap.replace(/\./g, "_")}`)}
        </Badge>
      ))}
    </div>
  )
}

const STATUS_COLORS: Record<RequestStatus, "grey" | "blue" | "orange" | "green" | "red" | "purple"> = {
  unverified: "grey",
  open: "blue",
  accepted: "purple",
  completed: "green",
  rejected: "red",
  expired: "grey",
}

export const RequestStatusBadge = ({ status }: { status: RequestStatus }) => {
  const { t } = useTranslation()
  return <StatusBadge color={STATUS_COLORS[status]}>{t(`compliance.gdpr.status.${status}`)}</StatusBadge>
}

/** Days to the deadline, red when overdue, orange when close. */
export const DaysLeft = ({ days, warn }: { days: number | null; warn: number }) => {
  const { t } = useTranslation()
  if (days === null) return <Text size="small">—</Text>
  const color = days < 0 ? "red" : days <= warn ? "orange" : "grey"
  return (
    <Badge size="2xsmall" color={color}>
      {days < 0 ? t("compliance.gdpr.overdue", { count: -days }) : t("compliance.gdpr.daysLeft", { count: days })}
    </Badge>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed border-ui-border-base px-6 py-8">
    <Text size="small" className="text-ui-fg-subtle">
      {children}
    </Text>
  </div>
)

/** Simple pager under a table. */
export const Pager = ({
  offset,
  limit,
  count,
  onChange,
}: {
  offset: number
  limit: number
  count: number
  onChange: (offset: number) => void
}) => {
  const { t } = useTranslation()
  if (count <= limit) return null
  return (
    <div className="flex items-center justify-between pt-2">
      <Text size="xsmall" className="text-ui-fg-subtle">
        {t("compliance.pager", { from: offset + 1, to: Math.min(offset + limit, count), count })}
      </Text>
      <div className="flex gap-x-2">
        <button
          type="button"
          className="txt-compact-small text-ui-fg-interactive disabled:text-ui-fg-disabled"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          {t("compliance.prev")}
        </button>
        <button
          type="button"
          className="txt-compact-small text-ui-fg-interactive disabled:text-ui-fg-disabled"
          disabled={offset + limit >= count}
          onClick={() => onChange(offset + limit)}
        >
          {t("compliance.next")}
        </button>
      </div>
    </div>
  )
}

/** Tabs styled the same in every integration (kit). */
export { TAB_CLASS, TabTrigger } from "../../lib/compliance/kit/ui"
