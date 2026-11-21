import { Badge, Button, Checkbox, FocusModal, Heading, Input, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { type AdvertAttribute, type BulkRow, useBulkPublish, useProductSearch, useSettings } from "../../lib/olx/api"
import { useDebounced } from "../../lib/olx/kit/hooks"
import { AttributeFields, CategoryPicker, useMissingAttributes } from "./pickers"
import { issueText } from "./shared"

const MAX = 50

/** Several products at once: one category and its fields, the rest from each product. */
export const BulkModal = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const q = useDebounced(search)
  const products = useProductSearch(q, open)
  const settings = useSettings(open)
  const bulk = useBulkPublish()
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [category, setCategory] = useState<{ id: number; name: string } | null>(null)
  const [attributes, setAttributes] = useState<AdvertAttribute[]>([])
  const [results, setResults] = useState<BulkRow[] | null>(null)
  const effective =
    category ??
    (settings.data?.category_id ? { id: settings.data.category_id, name: settings.data.category_name } : null)
  const missing = useMissingAttributes(effective?.id ?? null, attributes)
  const ids = Object.keys(chosen)

  const toggle = (id: string, label: string, on: boolean) =>
    setChosen((current) => {
      const next = { ...current }
      if (on && ids.length < MAX) next[id] = label
      if (!on) delete next[id]
      return next
    })

  const submit = async () => {
    if (!effective?.id) return
    try {
      const { results: rows } = await bulk.mutateAsync({ variant_ids: ids, category_id: effective.id, attributes })
      setResults(rows)
      setChosen({})
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const reason = (row: BulkRow) => {
    if (row.result === "invalid") return row.issues.map((issue) => issueText(t, issue)).join(" · ")
    if (row.result === "conflict") return t(`olx.conflict.${row.code}`)
    if (row.result === "refused" || row.result === "unconfirmed") return row.message
    return null
  }

  return (
    <FocusModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setResults(null)
      }}
    >
      <FocusModal.Trigger asChild>
        <Button size="small" variant="secondary">
          {t("olx.bulk.open")}
        </Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <FocusModal.Header>
          {!results && (
            <Button
              size="small"
              isLoading={bulk.isPending}
              disabled={!ids.length || !effective?.id || missing.length > 0}
              onClick={submit}
            >
              {t("olx.bulk.publish", { count: ids.length })}
            </Button>
          )}
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center overflow-y-auto">
          <div className="flex w-full max-w-3xl flex-col gap-y-6 px-6 py-8">
            <div>
              <Heading>{t("olx.bulk.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("olx.bulk.hint", { max: MAX })}
              </Text>
            </div>

            {results ? (
              <div className="divide-y rounded-md border border-ui-border-base">
                {results.map((row) => {
                  const ok = row.result === "published" || row.result === "saved"
                  return (
                    <div key={row.variant_id} className="flex flex-col gap-y-1 px-4 py-3">
                      <div className="flex items-center justify-between gap-x-2">
                        <Text size="small" weight="plus" className="truncate">
                          {row.title}
                        </Text>
                        <Badge size="2xsmall" color={ok ? "green" : row.result === "unconfirmed" ? "orange" : "red"}>
                          {t(`olx.bulk.result.${ok ? "ok" : row.result}`)}
                        </Badge>
                      </div>
                      {reason(row) && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {reason(row)}
                        </Text>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                <CategoryPicker
                  id={effective?.id ?? null}
                  name={effective?.name ?? ""}
                  onChange={(next) => {
                    setCategory(next)
                    setAttributes([])
                    if (!next && settings.data?.category_id) {
                      // Clearing the default: pick by search.
                      setCategory({ id: 0, name: "" })
                    }
                  }}
                />
                <AttributeFields categoryId={effective?.id || null} value={attributes} onChange={setAttributes} />
                {missing.length > 0 && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {t("olx.form.missingAttributes", { names: missing.join(", ") })}
                  </Text>
                )}
                <Input
                  size="small"
                  type="search"
                  value={search}
                  placeholder={t("olx.bulk.search")}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="divide-y rounded-md border border-ui-border-base">
                  {(products.data ?? []).flatMap((product) =>
                    (product.variants ?? []).map((variant) => {
                      const label =
                        (product.variants?.length ?? 0) > 1 ? `${product.title} · ${variant.title}` : product.title
                      return (
                        <label key={variant.id} className="flex cursor-pointer items-center gap-x-3 px-4 py-2">
                          <Checkbox
                            checked={Boolean(chosen[variant.id])}
                            onCheckedChange={(on) => toggle(variant.id, label, Boolean(on))}
                          />
                          {product.thumbnail && (
                            <img src={product.thumbnail} alt="" className="size-8 rounded object-cover" />
                          )}
                          <Text size="small" className="truncate">
                            {label}
                          </Text>
                        </label>
                      )
                    })
                  )}
                </div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("olx.form.paidNotice")}
                </Text>
              </>
            )}
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
