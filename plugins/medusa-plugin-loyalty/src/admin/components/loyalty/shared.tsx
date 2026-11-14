import { XMark } from "@medusajs/icons"
import { Badge, Checkbox, Input, Label, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { type Option } from "../../lib/loyalty/api"

/** One number on the dashboard. */
export const Tile = ({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) => (
  <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-base p-4 shadow-elevation-card-rest">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="xlarge" weight="plus">
      {value}
    </Text>
    {hint && (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

/** A titled block of a form. */
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

/** A labelled number input that keeps an empty field as null. */
export const NumberField = ({
  label,
  value,
  onChange,
  min,
  step,
  suffix,
  width = "w-32",
  disabled,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  step?: number
  suffix?: string
  width?: string
  disabled?: boolean
}) => (
  <div className="flex flex-col gap-y-1">
    <Label size="xsmall" weight="plus">
      {label}
    </Label>
    <div className="flex items-center gap-x-2">
      <Input
        size="small"
        type="number"
        aria-label={label}
        className={width}
        min={min}
        step={step}
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
  </div>
)

/** Search and tick several records (customer groups). */
export const Picker = ({
  label,
  value,
  onChange,
  options,
  labels,
  search,
  onSearch,
}: {
  label: string
  value: string[]
  onChange: (ids: string[]) => void
  options: Option[]
  labels: Record<string, string>
  search: string
  onSearch: (q: string) => void
}) => {
  const { t } = useTranslation()
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
              {labels[id] ?? id}
              <button type="button" aria-label={t("loyalty.remove")} onClick={() => toggle(id)}>
                <XMark className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        size="small"
        type="search"
        placeholder={t("loyalty.search")}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="max-h-44 overflow-y-auto rounded-md border border-ui-border-base">
        {options.length === 0 ? (
          <Text size="xsmall" className="text-ui-fg-muted px-3 py-2">
            {t("loyalty.noResults")}
          </Text>
        ) : (
          options.map((option) => (
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
    </div>
  )
}
