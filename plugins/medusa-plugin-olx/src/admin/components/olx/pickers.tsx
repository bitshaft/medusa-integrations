import { Checkbox, Input, Label, Select, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type AdvertAttribute,
  type Attribute,
  useAttributes,
  useCategories,
  useCities,
  useDistricts,
} from "../../lib/olx/api"
import { useDebounced } from "../../lib/olx/kit/hooks"

const Hits = <T extends { id: number }>({
  rows,
  label,
  onPick,
}: {
  rows: T[]
  label: (row: T) => string
  onPick: (row: T) => void
}) => (
  <div className="max-h-48 divide-y overflow-y-auto rounded-md border border-ui-border-base">
    {rows.map((row) => (
      <button
        key={row.id}
        type="button"
        onClick={() => onPick(row)}
        className="hover:bg-ui-bg-base-hover txt-compact-small block w-full px-3 py-2 text-left"
      >
        {label(row)}
      </button>
    ))}
  </div>
)

/** Search for OLX's category; suggestions come from a title. */
export const CategoryPicker = ({
  id,
  name,
  suggestFrom,
  onChange,
}: {
  id: number | null
  name: string
  suggestFrom?: string
  onChange: (category: { id: number; name: string } | null) => void
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const typed = useDebounced(text)
  const q = typed.trim() || (!id ? (suggestFrom ?? "").trim() : "")
  const { data, isError, error } = useCategories(q)
  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus">
        {t("olx.field.category")}
      </Label>
      {id ? (
        <div className="flex items-center justify-between gap-x-2 rounded-md border border-ui-border-base px-3 py-2">
          <Text size="small">{name || `#${id}`}</Text>
          <button type="button" className="text-ui-fg-interactive txt-compact-small" onClick={() => onChange(null)}>
            {t("olx.form.change")}
          </button>
        </div>
      ) : (
        <>
          <Input
            size="small"
            value={text}
            placeholder={t("olx.form.categorySearch")}
            onChange={(event) => setText(event.target.value)}
          />
          {isError && (
            <Text size="xsmall" className="text-ui-fg-error">
              {(error as Error).message}
            </Text>
          )}
          {data && data.length > 0 && (
            <Hits
              rows={data}
              label={(row) => [...row.path, row.name].join(" › ")}
              onPick={(row) => {
                onChange({ id: row.id, name: [...row.path, row.name].join(" › ") })
                setText("")
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

/** City, and a district where OLX has them for that city. */
export const CityPicker = ({
  cityId,
  cityName,
  districtId,
  onCity,
  onDistrict,
}: {
  cityId: number | null
  cityName: string
  districtId: number | null
  onCity: (city: { id: number; name: string } | null) => void
  onDistrict: (id: number | null) => void
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const typed = useDebounced(text)
  const cities = useCities(typed)
  const districts = useDistricts(cityId)
  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus">
        {t("olx.field.city")}
      </Label>
      {cityId ? (
        <div className="flex items-center justify-between gap-x-2 rounded-md border border-ui-border-base px-3 py-2">
          <Text size="small">{cityName || `#${cityId}`}</Text>
          <button
            type="button"
            className="text-ui-fg-interactive txt-compact-small"
            onClick={() => {
              onCity(null)
              onDistrict(null)
            }}
          >
            {t("olx.form.change")}
          </button>
        </div>
      ) : (
        <>
          <Input
            size="small"
            value={text}
            placeholder={t("olx.form.citySearch")}
            onChange={(event) => setText(event.target.value)}
          />
          {cities.isError && (
            <Text size="xsmall" className="text-ui-fg-error">
              {(cities.error as Error).message}
            </Text>
          )}
          {cities.data && cities.data.length > 0 && (
            <Hits
              rows={cities.data}
              label={(row) => (row.county && row.county !== row.name ? `${row.name} (${row.county})` : row.name)}
              onPick={(row) => {
                onCity({ id: row.id, name: row.name })
                onDistrict(null)
                setText("")
              }}
            />
          )}
        </>
      )}
      {cityId && districts.data && districts.data.length > 0 && (
        <Select
          size="small"
          value={districtId ? String(districtId) : undefined}
          onValueChange={(value) => onDistrict(Number(value))}
        >
          <Select.Trigger>
            <Select.Value placeholder={t("olx.form.district")} />
          </Select.Trigger>
          <Select.Content>
            {districts.data.map((district) => (
              <Select.Item key={district.id} value={String(district.id)}>
                {district.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      )}
    </div>
  )
}

const AttributeField = ({
  attribute,
  value,
  onChange,
}: {
  attribute: Attribute
  value: AdvertAttribute | undefined
  onChange: (next: AdvertAttribute | null) => void
}) => {
  const label = `${attribute.label}${attribute.unit ? ` (${attribute.unit})` : ""}${attribute.required ? " *" : ""}`
  if (attribute.multiple && attribute.values.length) {
    const chosen = value?.values ?? []
    return (
      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus">
          {label}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {attribute.values.map((option) => (
            <label key={option.code} className="txt-compact-small flex items-center gap-x-2">
              <Checkbox
                checked={chosen.includes(option.code)}
                onCheckedChange={(checked) => {
                  const next = checked ? [...chosen, option.code] : chosen.filter((code) => code !== option.code)
                  onChange(next.length ? { code: attribute.code, values: next } : null)
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (attribute.values.length) {
    return (
      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus">
          {label}
        </Label>
        <Select
          size="small"
          value={value?.value}
          onValueChange={(next) => onChange({ code: attribute.code, value: next })}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {attribute.values.map((option) => (
              <Select.Item key={option.code} value={option.code}>
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus">
        {label}
      </Label>
      <Input
        size="small"
        type={attribute.numeric ? "number" : "text"}
        value={value?.value ?? ""}
        onChange={(event) => onChange(event.target.value ? { code: attribute.code, value: event.target.value } : null)}
      />
    </div>
  )
}

/** The fields a category asks for. */
export const AttributeFields = ({
  categoryId,
  value,
  onChange,
}: {
  categoryId: number | null
  value: AdvertAttribute[]
  onChange: (next: AdvertAttribute[]) => void
}) => {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = useAttributes(categoryId)
  if (!categoryId) return null
  if (isLoading) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        {t("olx.form.loadingAttributes")}
      </Text>
    )
  }
  if (isError) {
    return (
      <Text size="small" className="text-ui-fg-error">
        {(error as Error).message}
      </Text>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {(data ?? []).map((attribute) => (
        <AttributeField
          key={attribute.code}
          attribute={attribute}
          value={value.find((row) => row.code === attribute.code)}
          onChange={(next) => {
            const others = value.filter((row) => row.code !== attribute.code)
            onChange(next ? [...others, next] : others)
          }}
        />
      ))}
    </div>
  )
}

/** Required attributes still empty. */
export function useMissingAttributes(categoryId: number | null, value: AdvertAttribute[]): string[] {
  const { data } = useAttributes(categoryId)
  return (data ?? [])
    .filter((attribute) => attribute.required)
    .filter((attribute) => {
      const row = value.find((item) => item.code === attribute.code)
      return !row?.value && !row?.values?.length
    })
    .map((attribute) => attribute.label)
}
