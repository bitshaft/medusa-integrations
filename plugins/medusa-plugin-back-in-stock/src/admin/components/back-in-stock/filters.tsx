import { ChevronDownMini, XMark } from "@medusajs/icons"
import { Badge, Button, Checkbox, Input, Popover, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useProductOptions, useProductTitles } from "../../lib/back-in-stock/api"
import { useDebounced } from "../../lib/back-in-stock/kit/hooks"

/** "Products" button: search Medusa's products and tick several. */
export const ProductFilter = ({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const query = useDebounced(search.trim())
  const options = useProductOptions(query, open)
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  const products = options.data ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="small" variant="secondary">
          {value.length
            ? t("back-in-stock.filters.productsCount", { count: value.length })
            : t("back-in-stock.filters.products")}
          <ChevronDownMini className="text-ui-fg-muted" />
        </Button>
      </Popover.Trigger>
      <Popover.Content align="end" className="w-80 p-0">
        <div className="border-ui-border-base border-b p-2">
          <Input
            size="small"
            type="search"
            autoFocus
            placeholder={t("back-in-stock.filters.searchProducts")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {!products.length ? (
            <Text size="xsmall" className="text-ui-fg-muted px-3 py-2">
              {options.isLoading ? t("back-in-stock.filters.loading") : t("back-in-stock.filters.noProducts")}
            </Text>
          ) : (
            products.map((product) => (
              <label
                key={product.id}
                className="hover:bg-ui-bg-base-hover flex cursor-pointer items-center gap-x-2 px-3 py-1.5"
              >
                <Checkbox checked={value.includes(product.id)} onCheckedChange={() => toggle(product.id)} />
                {product.thumbnail ? (
                  <img src={product.thumbnail} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                ) : (
                  <div className="bg-ui-bg-component h-6 w-6 shrink-0 rounded" />
                )}
                <Text size="small" className="truncate">
                  {product.title}
                </Text>
              </label>
            ))
          )}
        </div>
        {value.length > 0 && (
          <div className="border-ui-border-base flex justify-end border-t p-2">
            <Button size="small" variant="transparent" onClick={() => onChange([])}>
              {t("back-in-stock.filters.clear")}
            </Button>
          </div>
        )}
      </Popover.Content>
    </Popover>
  )
}

export type Chip = { key: string; label: string; onRemove: () => void }

/** The filters in use, each removable; nothing when none is set. */
export const FilterChips = ({ chips }: { chips: Chip[] }) => {
  const { t } = useTranslation()
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1 px-6 py-2">
      {chips.map((chip) => (
        <Badge key={chip.key} size="small" className="gap-x-1">
          {chip.label}
          <button
            type="button"
            aria-label={t("back-in-stock.filters.remove")}
            className="text-ui-fg-muted hover:text-ui-fg-base"
            onClick={chip.onRemove}
          >
            <XMark className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  )
}

/** Chips for the products chosen in `ProductFilter`. */
export function useProductChips(value: string[], onChange: (ids: string[]) => void): Chip[] {
  const titles = useProductTitles(value)
  return value.map((id) => ({
    key: `product:${id}`,
    label: titles.data?.[id] ?? id,
    onRemove: () => onChange(value.filter((v) => v !== id)),
  }))
}
