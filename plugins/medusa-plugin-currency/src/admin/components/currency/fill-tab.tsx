import { ChevronDownMini, XMark } from "@medusajs/icons"
import { Badge, Button, Checkbox, Container, Heading, Input, Popover, Select, Tabs, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type FillScope,
  useCategories,
  useCollections,
  useProductSearch,
  useProductTitles,
} from "../../lib/currency/api"
import { useDebounced } from "../../lib/currency/kit/hooks"
import { TAB_CLASS } from "../../lib/currency/kit/ui"
import { FillPanel } from "./fill-panel"

type Kind = "products" | "collection" | "category" | "demo"

/** The "Fill prices" tab: choose products, a collection or a category, then preview and save. */
export const FillTab = ({ demo }: { demo: boolean }) => {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Kind>(demo ? "demo" : "products")
  const [products, setProducts] = useState<string[]>([])
  const [collection, setCollection] = useState<string>("")
  const [category, setCategory] = useState<string>("")
  const collections = useCollections(kind === "collection")
  const categories = useCategories(kind === "category")

  const scope: FillScope | null =
    kind === "demo"
      ? { kind: "demo" }
      : kind === "products"
        ? products.length
          ? { kind: "products", ids: products }
          : null
        : kind === "collection"
          ? collection
            ? { kind: "collection", id: collection }
            : null
          : category
            ? { kind: "category", id: category }
            : null

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Heading level="h2">{t("currency.fill.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("currency.fill.subtitle")}
          </Text>
        </div>
        <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)}>
          <Tabs.List>
            {(demo
              ? (["demo", "products", "collection", "category"] as const)
              : (["products", "collection", "category"] as const)
            ).map((value) => (
              <Tabs.Trigger key={value} className={TAB_CLASS} value={value}>
                {t(`currency.scope.${value}`)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
        {kind === "demo" && (
          <Text size="small" className="text-ui-fg-subtle">
            {t("currency.scope.demoHint")}
          </Text>
        )}
        {kind === "products" && <ProductPicker value={products} onChange={setProducts} />}
        {kind === "collection" && (
          <div className="max-w-sm">
            <Select value={collection} onValueChange={setCollection}>
              <Select.Trigger>
                <Select.Value placeholder={t("currency.scope.chooseCollection")} />
              </Select.Trigger>
              <Select.Content>
                {(collections.data ?? []).map((option) => (
                  <Select.Item key={option.id} value={option.id}>
                    {option.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        )}
        {kind === "category" && (
          <div className="flex max-w-sm flex-col gap-y-1">
            <Select value={category} onValueChange={setCategory}>
              <Select.Trigger>
                <Select.Value placeholder={t("currency.scope.chooseCategory")} />
              </Select.Trigger>
              <Select.Content>
                {(categories.data ?? []).map((option) => (
                  <Select.Item key={option.id} value={option.id}>
                    {option.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("currency.scope.categoryHint")}
            </Text>
          </div>
        )}
      </div>
      <FillPanel scope={scope} />
    </Container>
  )
}

/** Search Medusa's products and tick several. */
const ProductPicker = ({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const query = useDebounced(search.trim())
  const options = useProductSearch(query, open)
  const titles = useProductTitles(value)
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="flex flex-col gap-y-2">
      <div>
        <Popover open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <Button size="small" variant="secondary">
              {value.length
                ? t("currency.scope.productsCount", { count: value.length })
                : t("currency.scope.chooseProducts")}
              <ChevronDownMini className="text-ui-fg-muted" />
            </Button>
          </Popover.Trigger>
          <Popover.Content align="start" className="w-80 p-0">
            <div className="border-ui-border-base border-b p-2">
              <Input
                size="small"
                type="search"
                autoFocus
                placeholder={t("currency.scope.searchProducts")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {!(options.data ?? []).length ? (
                <Text size="xsmall" className="text-ui-fg-muted px-3 py-2">
                  {options.isLoading ? t("currency.loading") : t("currency.scope.noProducts")}
                </Text>
              ) : (
                (options.data ?? []).map((product) => (
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
          </Popover.Content>
        </Popover>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} size="small" className="gap-x-1">
              {titles.data?.[id] ?? id}
              <button
                type="button"
                aria-label={t("currency.scope.remove")}
                className="text-ui-fg-muted hover:text-ui-fg-base"
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                <XMark className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
