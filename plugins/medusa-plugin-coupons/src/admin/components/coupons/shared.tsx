import { XMark } from "@medusajs/icons"
import { Badge, Checkbox, clx, Input, Label, Text } from "@medusajs/ui"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { type CouponStatus, type OptionKind, useLabels, useOptions } from "../../lib/coupons/api"

const STATUS_COLOR: Record<CouponStatus, "green" | "blue" | "orange" | "grey"> = {
  active: "green",
  scheduled: "blue",
  paused: "orange",
  ended: "grey",
}

export const StatusBadge = ({ status }: { status: CouponStatus }) => {
  const { t } = useTranslation()
  return (
    <Badge size="2xsmall" color={STATUS_COLOR[status]}>
      {t(`coupons.status.${status}`)}
    </Badge>
  )
}

/*
 * Selected tiles and chips use Medusa's inverted button colours:
 * `bg-ui-button-inverted` with `text-ui-contrast-fg-primary`, as the
 * Button "inverted" variant does. (`text-ui-fg-on-inverted` is dark in the
 * dark theme, which made selected items unreadable there.)
 */

/** A selectable tile, as in the wizard's "Kind" and "Who" steps. */
export const ChoiceCard = ({
  selected,
  icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  selected: boolean
  icon: ReactNode
  title: string
  hint?: string
  onClick: () => void
  disabled?: boolean
}) => (
  <button
    type="button"
    disabled={disabled}
    aria-pressed={selected}
    onClick={onClick}
    className={clx(
      "flex items-start gap-x-3 rounded-lg border p-4 text-left transition-colors",
      selected
        ? "border-ui-border-interactive bg-ui-bg-highlight shadow-borders-interactive-with-focus"
        : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-base-hover",
      disabled && !selected && "cursor-not-allowed opacity-50"
    )}
  >
    <span
      className={clx(
        "flex size-8 shrink-0 items-center justify-center rounded-md",
        selected ? "bg-ui-button-inverted text-ui-contrast-fg-primary" : "bg-ui-bg-component text-ui-fg-subtle"
      )}
    >
      {icon}
    </span>
    <span className="flex flex-col">
      <Text size="small" weight="plus">
        {title}
      </Text>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </span>
  </button>
)

/** Quick values next to a custom field: "5%", "10%", "bez końca", … */
export const QuickChoices = <T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: T; label: string }>
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
}) => (
  <div className="flex flex-wrap gap-2" role="group">
    {options.map((option) => (
      <button
        key={String(option.value)}
        type="button"
        disabled={disabled}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={clx(
          "txt-compact-small-plus rounded-md border px-3 py-1.5 transition-colors",
          value === option.value
            ? "border-ui-border-interactive bg-ui-button-inverted text-ui-contrast-fg-primary"
            : "border-ui-border-base bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-base-hover",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
)

/** A titled block inside a wizard step. */
export const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-3 rounded-lg border border-ui-border-base p-4">
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
    {children}
  </div>
)

/** Search Medusa records (groups, categories, products…) and tick several. */
export const MultiPicker = ({
  kind,
  label,
  value,
  onChange,
  disabled,
}: {
  kind: OptionKind
  label: string
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) => {
  const { t } = useTranslation()
  const [q, setQ] = useState("")
  const options = useOptions(kind, q, !disabled)
  const labels = useLabels(kind, value)
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="flex flex-col gap-y-2">
      <Label size="xsmall" weight="plus">
        {label}
      </Label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} size="2xsmall" className="gap-x-1">
              {labels.data?.[id] ?? id}
              {!disabled && (
                <button type="button" aria-label={t("coupons.wizard.remove")} onClick={() => toggle(id)}>
                  <XMark className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <>
          <Input
            size="small"
            type="search"
            placeholder={t("coupons.wizard.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto rounded-md border border-ui-border-base">
            {(options.data ?? []).length === 0 ? (
              <Text size="xsmall" className="text-ui-fg-muted px-3 py-2">
                {options.isLoading ? t("coupons.loading") : t("coupons.wizard.noResults")}
              </Text>
            ) : (
              (options.data ?? []).map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-x-2 px-3 py-1.5 hover:bg-ui-bg-base-hover"
                >
                  <Checkbox checked={value.includes(option.value)} onCheckedChange={() => toggle(option.value)} />
                  <Text size="small">{option.label}</Text>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** A number field that keeps an empty input as null. */
export const NumberField = ({
  value,
  onChange,
  min,
  step,
  suffix,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  step?: number
  suffix?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel: string
}) => (
  <div className="flex items-center gap-x-2">
    <Input
      size="small"
      type="number"
      aria-label={ariaLabel}
      className="w-32"
      min={min}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
    {suffix && (
      <Text size="small" className="text-ui-fg-subtle">
        {suffix}
      </Text>
    )}
  </div>
)
